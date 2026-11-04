import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createAccount } from "../../src/ledger/accounts";
import { commitImport } from "../../src/ledger/imports";
import {
  batchBalanceGap,
  getBatchBalanceCheck,
  ImportBatchNotFoundError,
  ImportBatchWithoutMovementError,
} from "../../src/ledger/import-checks";
import { createTransaction } from "../../src/ledger/transactions";
import {
  type AppDatabase,
  migrateDatabase,
  openDatabase,
} from "../../src/storage/database";
import { transactions } from "../../src/storage/schema";

const NOW = new Date("2026-04-15T10:00:00Z");
const OPENING_BALANCE = 10_000;

const ACCOUNT = {
  kind: "checking",
  currency: "EUR",
  openingDate: "2026-01-01",
  openingBalance: OPENING_BALANCE,
} as const;

function row(date: string, amount: number, label: string) {
  return { date, amount, label, externalId: null };
}

describe("import checks", () => {
  let dataDir: string;
  let db: AppDatabase;
  let accountId: number;

  beforeEach(() => {
    dataDir = mkdtempSync(path.join(tmpdir(), "demain-test-"));
    db = openDatabase(dataDir);
    migrateDatabase(db);
    accountId = createAccount(db, { ...ACCOUNT, name: "Checking" }).id;
  });

  afterEach(() => {
    db.$client.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  function importFile(rows: ReturnType<typeof row>[], onAccountId = accountId): number {
    const result = commitImport(db, {
      accountId: onAccountId,
      rows,
      format: "csv",
      fileName: "march.csv",
      mapping: null,
      now: NOW,
    });
    if (result.batchId === null) throw new Error("nothing was imported");
    return result.batchId;
  }

  it("ends the file on the latest date of its movements, not today", () => {
    const batchId = importFile([
      row("2026-03-10", -1_000, "A"),
      row("2026-03-31", -500, "B"),
      row("2026-03-02", -250, "C"),
    ]);

    expect(getBatchBalanceCheck(db, batchId).endDate).toBe("2026-03-31");
  });

  it("computes the balance on the end date from the opening balance and the account movements", () => {
    const batchId = importFile([row("2026-03-10", -1_000, "A"), row("2026-03-31", -500, "B")]);

    expect(getBatchBalanceCheck(db, batchId)).toMatchObject({
      batchId,
      accountId,
      currency: "EUR",
      computedBalance: OPENING_BALANCE - 1_500,
    });
  });

  it("counts a manual movement dated before the end date and ignores a later one", () => {
    const batchId = importFile([row("2026-03-31", -500, "B")]);
    createTransaction(db, { accountId, date: "2026-03-15", amount: 2_000, kind: "income", label: "Salary" });
    createTransaction(db, { accountId, date: "2026-04-02", amount: -9_999, kind: "expense", label: "Later" });

    expect(getBatchBalanceCheck(db, batchId).computedBalance).toBe(OPENING_BALANCE + 2_000 - 500);
  });

  it("ignores the movements of other accounts", () => {
    const other = createAccount(db, { ...ACCOUNT, name: "Other", openingBalance: 777 }).id;
    createTransaction(db, { accountId: other, date: "2026-06-01", amount: 5_000, kind: "income", label: "Elsewhere" });
    const batchId = importFile([row("2026-03-31", -500, "B")]);

    const check = getBatchBalanceCheck(db, batchId);

    expect(check.endDate).toBe("2026-03-31");
    expect(check.computedBalance).toBe(OPENING_BALANCE - 500);
  });

  it("refuses an unknown batch", () => {
    expect(() => getBatchBalanceCheck(db, 999)).toThrow(ImportBatchNotFoundError);
  });

  it("refuses a batch whose movements are all gone", () => {
    const batchId = importFile([row("2026-03-31", -500, "B")]);
    db.delete(transactions).run();

    expect(() => getBatchBalanceCheck(db, batchId)).toThrow(ImportBatchWithoutMovementError);
  });

  describe("batchBalanceGap", () => {
    const check = {
      batchId: 1,
      accountId: 1,
      currency: "EUR",
      endDate: "2026-03-31",
      computedBalance: 50_000,
    };

    it("is zero when the real balance equals the computed balance", () => {
      expect(batchBalanceGap(check, 50_000)).toBe(0);
    });

    it("is positive when Demain holds more than the bank", () => {
      expect(batchBalanceGap(check, 46_544)).toBe(3_456);
    });

    it("is negative when Demain holds less than the bank", () => {
      expect(batchBalanceGap(check, 53_456)).toBe(-3_456);
    });
  });
});
