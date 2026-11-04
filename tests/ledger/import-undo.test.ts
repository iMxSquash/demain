import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { detailsFromSign, type RowDetails } from "../../src/domain/import-draft";
import { TransactionValidationError } from "../../src/domain/transaction";
import { archiveAccount, createAccount } from "../../src/ledger/accounts";
import { createCategory } from "../../src/ledger/categories";
import {
  ImportBatchChangedError,
  ImportBatchUnverifiableError,
  undoImportBatch,
} from "../../src/ledger/import-undo";
import { ImportBatchNotFoundError } from "../../src/ledger/import-checks";
import { commitImport, listImportBatches, type ImportRow } from "../../src/ledger/imports";
import {
  createTransaction,
  deleteTransaction,
  listTransactions,
  setTransactionCategory,
  updateTransaction,
} from "../../src/ledger/transactions";
import {
  type AppDatabase,
  migrateDatabase,
  openDatabase,
} from "../../src/storage/database";
import { importBatches } from "../../src/storage/schema";

const NOW = new Date("2026-04-15T10:00:00Z");
const ACCOUNT_DETAILS = {
  currency: "EUR",
  openingDate: "2026-01-01",
} as const;

function row(date: string, amount: number, label: string): ImportRow {
  return { date, amount, label, externalId: null };
}

function catchError(action: () => unknown): unknown {
  try {
    action();
  } catch (error) {
    return error;
  }
  return null;
}

describe("undoing an imported batch", () => {
  let dataDir: string;
  let db: AppDatabase;
  let accountId: number;
  let savingsId: number;

  beforeEach(() => {
    dataDir = mkdtempSync(path.join(tmpdir(), "demain-test-"));
    db = openDatabase(dataDir);
    migrateDatabase(db);
    accountId = createAccount(db, {
      ...ACCOUNT_DETAILS,
      name: "Checking",
      kind: "checking",
      openingBalance: 100_000,
    }).id;
    savingsId = createAccount(db, {
      ...ACCOUNT_DETAILS,
      name: "Savings",
      kind: "savings",
      openingBalance: 0,
    }).id;
  });

  afterEach(() => {
    db.$client.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  function importFile(rows: ImportRow[], fileName = "march.csv"): number {
    const result = commitImport(db, {
      accountId,
      rows,
      format: "csv",
      fileName,
      mapping: null,
      now: NOW,
    });
    if (result.batchId === null) throw new Error("nothing was imported");
    return result.batchId;
  }

  const savingsRow = (amount: number, label: string): ImportRow => {
    const details: RowDetails = {
      ...detailsFromSign(amount),
      type: "savings",
      savingsAccountId: savingsId,
    };
    return { ...row("2026-03-12", amount, label), details };
  };

  const transactionCount = () => listTransactions(db).length;

  describe("when nothing changed since the import", () => {
    it("removes every transaction of the batch and the batch row", () => {
      const batchId = importFile([row("2026-03-10", -1_000, "A"), row("2026-03-11", 2_000, "B")]);

      const removed = undoImportBatch(db, batchId);

      expect(removed).toBe(2);
      expect(transactionCount()).toBe(0);
      expect(listImportBatches(db, accountId)).toEqual([]);
    });

    it("keeps the movements of other batches and the manual transactions", () => {
      const other = importFile([row("2026-02-10", -300, "OTHER")], "february.csv");
      createTransaction(db, {
        accountId,
        date: "2026-03-20",
        amount: -50,
        kind: "expense",
        label: "MANUAL",
      });
      const batchId = importFile([row("2026-03-10", -1_000, "A")]);

      undoImportBatch(db, batchId);

      expect(listTransactions(db).map((t) => t.label)).toEqual(["OTHER", "MANUAL"]);
      expect(listImportBatches(db, accountId).map((b) => b.id)).toEqual([other]);
    });

    it("removes both legs of a savings transfer as one pair", () => {
      const batchId = importFile([savingsRow(-5_000, "TO SAVINGS"), row("2026-03-10", -100, "A")]);
      expect(transactionCount()).toBe(3);

      const removed = undoImportBatch(db, batchId);

      expect(removed).toBe(3);
      expect(transactionCount()).toBe(0);
    });

    it("lets the same file be imported again afterwards", () => {
      const rows = [row("2026-03-10", -1_000, "A"), savingsRow(-5_000, "TO SAVINGS")];
      const batchId = importFile(rows);
      undoImportBatch(db, batchId);

      const again = commitImport(db, {
        accountId,
        rows,
        format: "csv",
        fileName: "march.csv",
        mapping: null,
        now: NOW,
      });

      expect(again.duplicateCount).toBe(0);
      expect(again.batchId).not.toBeNull();
      expect(transactionCount()).toBe(3);
    });

    it("is allowed when an edit was reverted to the imported values", () => {
      const batchId = importFile([row("2026-03-10", -1_000, "A")]);
      const [imported] = listTransactions(db);
      if (imported === undefined) throw new Error("no transaction");
      const original = {
        accountId,
        date: imported.date,
        amount: imported.amount,
        kind: "expense",
        label: imported.label,
      } as const;
      updateTransaction(db, imported.id, { ...original, label: "EDITED" });
      updateTransaction(db, imported.id, original);

      expect(undoImportBatch(db, batchId)).toBe(1);
    });
  });

  describe("refusals", () => {
    it("refuses a batch whose transaction was re-categorised, and deletes nothing", () => {
      const batchId = importFile([row("2026-03-10", -1_000, "A"), row("2026-03-11", -200, "B")]);
      const category = createCategory(db, { name: "Food" });
      const [first] = listTransactions(db);
      if (first === undefined) throw new Error("no transaction");
      setTransactionCategory(db, first.id, category.id);

      expect(catchError(() => undoImportBatch(db, batchId))).toBeInstanceOf(
        ImportBatchChangedError,
      );
      expect(transactionCount()).toBe(2);
      expect(listImportBatches(db, accountId)).toHaveLength(1);
    });

    it("refuses a batch from which a transaction was deleted, and deletes nothing", () => {
      const batchId = importFile([row("2026-03-10", -1_000, "A"), row("2026-03-11", -200, "B")]);
      const [first] = listTransactions(db);
      if (first === undefined) throw new Error("no transaction");
      deleteTransaction(db, first.id);

      expect(catchError(() => undoImportBatch(db, batchId))).toBeInstanceOf(
        ImportBatchChangedError,
      );
      expect(transactionCount()).toBe(1);
    });

    it("refuses a batch recorded without a digest, and deletes nothing", () => {
      const batchId = importFile([row("2026-03-10", -1_000, "A")]);
      db.update(importBatches).set({ contentDigest: null }).where(eq(importBatches.id, batchId)).run();

      expect(catchError(() => undoImportBatch(db, batchId))).toBeInstanceOf(
        ImportBatchUnverifiableError,
      );
      expect(transactionCount()).toBe(1);
      expect(listImportBatches(db, accountId)).toHaveLength(1);
    });

    it("refuses when the account of the file is archived, and deletes nothing", () => {
      const batchId = importFile([row("2026-03-10", -1_000, "A")]);
      createTransaction(db, {
        accountId,
        date: "2026-04-01",
        amount: -99_000,
        kind: "expense",
        label: "EMPTY",
      });
      archiveAccount(db, accountId);

      expect(catchError(() => undoImportBatch(db, batchId))).toBeInstanceOf(
        TransactionValidationError,
      );
      expect(transactionCount()).toBe(2);
    });

    it("refuses when the account of a transfer leg is archived, and deletes nothing", () => {
      const batchId = importFile([savingsRow(-5_000, "TO SAVINGS")]);
      createTransaction(db, {
        accountId: savingsId,
        date: "2026-04-01",
        amount: -5_000,
        kind: "expense",
        label: "EMPTY",
      });
      archiveAccount(db, savingsId);

      expect(catchError(() => undoImportBatch(db, batchId))).toBeInstanceOf(
        TransactionValidationError,
      );
      expect(transactionCount()).toBe(3);
      expect(listImportBatches(db, accountId)).toHaveLength(1);
    });

    it("refuses an unknown batch", () => {
      expect(catchError(() => undoImportBatch(db, 999))).toBeInstanceOf(
        ImportBatchNotFoundError,
      );
    });
  });
});
