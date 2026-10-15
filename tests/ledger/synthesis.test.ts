import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { archiveAccount, createAccount } from "../../src/ledger/accounts";
import { getMonthlySynthesis } from "../../src/ledger/synthesis";
import {
  createTransaction,
  createTransfer,
} from "../../src/ledger/transactions";
import {
  type AppDatabase,
  migrateDatabase,
  openDatabase,
} from "../../src/storage/database";

const ACCOUNT = {
  currency: "EUR",
  openingDate: "2026-01-01",
  openingBalance: 0,
};

describe("getMonthlySynthesis", () => {
  let dataDir: string;
  let db: AppDatabase;

  beforeEach(() => {
    dataDir = mkdtempSync(path.join(tmpdir(), "demain-test-"));
    db = openDatabase(dataDir);
    migrateDatabase(db);
  });

  afterEach(() => {
    db.$client.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("builds the synthesis from the stored accounts, transactions and transfers", () => {
    const checking = createAccount(db, { ...ACCOUNT, name: "Checking", kind: "checking" });
    const livretA = createAccount(db, { ...ACCOUNT, name: "Livret A", kind: "savings" });
    createTransaction(db, {
      accountId: checking.id,
      date: "2026-01-31",
      amount: 57_614,
      kind: "income",
      label: "Salary",
    });
    createTransfer(db, {
      sourceId: checking.id,
      destinationId: livretA.id,
      amount: 57_316,
      date: "2026-01-31",
      label: "Savings",
    });

    const [january] = getMonthlySynthesis(db, {
      referenceCurrency: "EUR",
      throughMonth: "2026-01",
    });

    expect(january).toMatchObject({
      month: "2026-01",
      net: 57_614,
      savings: 57_316,
      cumulativeAccount: 298,
      total: 57_614,
    });
  });

  it("keeps an archived account and its history in the figures of its months", () => {
    const closed = createAccount(db, { ...ACCOUNT, name: "Old", kind: "checking" });
    const kept = createAccount(db, { ...ACCOUNT, name: "Checking", kind: "checking" });
    createTransaction(db, {
      accountId: closed.id,
      date: "2026-01-10",
      amount: 900,
      kind: "income",
      label: "Refund",
    });
    createTransfer(db, {
      sourceId: closed.id,
      destinationId: kept.id,
      amount: 900,
      date: "2026-01-20",
      label: "Empty it",
    });
    archiveAccount(db, closed.id);

    const [january] = getMonthlySynthesis(db, {
      referenceCurrency: "EUR",
      throughMonth: "2026-01",
    });

    expect(january?.net).toBe(900);
    expect(january?.balances.map((entry) => entry.accountId)).toEqual([
      closed.id,
      kept.id,
    ]);
  });

  it("reproduces both months of the worked example from the stored data", () => {
    const checking = createAccount(db, { ...ACCOUNT, name: "Checking", kind: "checking" });
    const livretA = createAccount(db, { ...ACCOUNT, name: "Livret A", kind: "savings" });
    const record = (date: string, income: number, saved: number) => {
      createTransaction(db, {
        accountId: checking.id,
        date,
        amount: income,
        kind: "income",
        label: "Salary",
      });
      createTransfer(db, {
        sourceId: checking.id,
        destinationId: livretA.id,
        amount: saved,
        date,
        label: "Savings",
      });
    };
    record("2026-01-31", 57_614, 57_316);
    record("2026-02-28", 80_607, 65_000);

    const months = getMonthlySynthesis(db, {
      referenceCurrency: "EUR",
      throughMonth: "2026-02",
    });

    expect(
      months.map((month) => [
        month.month,
        month.net,
        month.savings,
        month.cumulativeSavings,
        month.cumulativeAccount,
        month.total,
      ]),
    ).toEqual([
      ["2026-01", 57_614, 57_316, 57_316, 298, 57_614],
      ["2026-02", 80_607, 65_000, 122_316, 15_905, 138_221],
    ]);
  });

  it("keeps the savings flows of an archived savings account in the months they happened", () => {
    const checking = createAccount(db, { ...ACCOUNT, name: "Checking", kind: "checking" });
    const savings = createAccount(db, { ...ACCOUNT, name: "Old savings", kind: "savings" });
    createTransaction(db, {
      accountId: checking.id,
      date: "2026-01-05",
      amount: 10_000,
      kind: "income",
      label: "Salary",
    });
    createTransfer(db, {
      sourceId: checking.id,
      destinationId: savings.id,
      amount: 4_000,
      date: "2026-01-10",
      label: "Savings",
    });
    createTransfer(db, {
      sourceId: savings.id,
      destinationId: checking.id,
      amount: 4_000,
      date: "2026-02-10",
      label: "Back to checking",
    });
    archiveAccount(db, savings.id);

    const months = getMonthlySynthesis(db, {
      referenceCurrency: "EUR",
      throughMonth: "2026-02",
    });

    expect(months.map((month) => [month.month, month.savings])).toEqual([
      ["2026-01", 4_000],
      ["2026-02", -4_000],
    ]);
  });
});
