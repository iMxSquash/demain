import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createAccount } from "../../src/ledger/accounts";
import { compareStoredHistoryWithSummary } from "../../src/ledger/summary-comparison";
import { createTransaction, createTransfer } from "../../src/ledger/transactions";
import {
  type AppDatabase,
  migrateDatabase,
  openDatabase,
} from "../../src/storage/database";

const ACCOUNT = { currency: "EUR", openingDate: "2026-01-01", openingBalance: 0 };
const OPTIONS = { referenceCurrency: "EUR", lastCompleteMonth: "2026-02" };

describe("compareStoredHistoryWithSummary", () => {
  let dataDir: string;
  let db: AppDatabase;

  beforeEach(() => {
    dataDir = mkdtempSync(path.join(tmpdir(), "demain-test-"));
    db = openDatabase(dataDir);
    migrateDatabase(db);
    const checking = createAccount(db, { ...ACCOUNT, name: "Checking", kind: "checking" });
    const savings = createAccount(db, { ...ACCOUNT, name: "Livret", kind: "savings" });
    createTransaction(db, {
      accountId: checking.id,
      date: "2026-01-31",
      amount: 57_614,
      kind: "income",
      label: "Salary",
    });
    createTransfer(db, {
      sourceId: checking.id,
      destinationId: savings.id,
      amount: 57_316,
      date: "2026-01-31",
      label: "Savings",
    });
  });

  afterEach(() => {
    db.$client.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  const january = {
    month: "2026-01",
    net: 57_614,
    savings: 57_316,
    cumulativeSavings: 57_316,
    cumulativeAccount: 298,
    savingsBalance: 57_316,
  };

  it("matches a Summary that agrees with the stored history", () => {
    const result = compareStoredHistoryWithSummary(db, [january], OPTIONS);

    expect(result.isMatching).toBe(true);
  });

  it("reports the figure that differs, savings balance included", () => {
    const result = compareStoredHistoryWithSummary(
      db,
      [{ ...january, savingsBalance: 57_000 }],
      OPTIONS,
    );

    expect(result.differences).toEqual([
      { month: "2026-01", figure: "savingsBalance", sheet: 57_000, demain: 57_316 },
    ]);
  });
});
