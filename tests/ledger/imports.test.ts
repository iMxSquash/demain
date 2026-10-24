import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { CsvMapping } from "../../src/domain/import-csv";
import type { ImportedRow } from "../../src/domain/import-row";
import { archiveAccount, createAccount } from "../../src/ledger/accounts";
import {
  commitImport,
  getLastCsvMapping,
  listImportBatches,
  previewImport,
} from "../../src/ledger/imports";
import {
  listTransactions,
  listUncategorizedTransactions,
} from "../../src/ledger/transactions";
import {
  type AppDatabase,
  migrateDatabase,
  openDatabase,
} from "../../src/storage/database";
import { importBatches } from "../../src/storage/schema";

const NOW = new Date("2026-03-01T10:00:00Z");

const MAPPING: CsvMapping = {
  delimiter: ";",
  hasHeader: true,
  dateColumn: 0,
  dateFormat: "dmy",
  labelColumn: 1,
  amount: { kind: "single", column: 2 },
};

function row(overrides: Partial<ImportedRow> = {}): ImportedRow {
  return {
    date: "2026-02-01",
    amount: -1_250,
    label: "CARD SHOP",
    externalId: null,
    ...overrides,
  };
}

describe("imports", () => {
  let dataDir: string;
  let db: AppDatabase;
  let accountId: number;

  beforeEach(() => {
    dataDir = mkdtempSync(path.join(tmpdir(), "demain-test-"));
    db = openDatabase(dataDir);
    migrateDatabase(db);
    accountId = createAccount(db, {
      name: "Checking",
      kind: "checking",
      currency: "EUR",
      openingDate: "2026-01-01",
      openingBalance: 0,
    }).id;
  });

  afterEach(() => {
    db.$client.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  function importRows(rows: ImportedRow[], mapping: CsvMapping | null = null) {
    return commitImport(db, {
      accountId,
      format: mapping === null ? "ofx" : "csv",
      fileName: "statement.file",
      mapping,
      rows,
      now: NOW,
    });
  }

  it("creates one transaction per row, signed by direction and waiting for a category", () => {
    importRows([row(), row({ date: "2026-02-05", amount: 114_388, label: "SALARY" })]);

    const imported = listTransactions(db);
    expect(imported.map((t) => [t.kind, t.amount, t.label])).toEqual([
      ["expense", -1_250, "CARD SHOP"],
      ["income", 114_388, "SALARY"],
    ]);
    expect(listUncategorizedTransactions(db)).toHaveLength(2);
  });

  it("records the import as a batch that its transactions point to", () => {
    const result = importRows([row()], MAPPING);

    const [batch] = listImportBatches(db, accountId);
    expect(batch).toMatchObject({
      id: result.batchId,
      format: "csv",
      fileName: "statement.file",
      importedAt: "2026-03-01T10:00:00.000Z",
    });
    expect(listTransactions(db)[0]?.importBatchId).toBe(result.batchId);
  });

  it("creates no duplicate when the same rows are imported twice", () => {
    const rows = [row(), row({ label: "BAKERY", amount: -320 })];
    importRows(rows);

    const second = importRows(rows);

    expect(second).toMatchObject({ newCount: 0, duplicateCount: 2, batchId: null });
    expect(listTransactions(db)).toHaveLength(2);
    expect(listImportBatches(db, accountId)).toHaveLength(1);
  });

  it("imports only the new rows of an overlapping file", () => {
    importRows([row()]);

    const result = importRows([row(), row({ label: "BAKERY", amount: -320 })]);

    expect(result).toMatchObject({ newCount: 1, duplicateCount: 1 });
  });

  it("keeps two identical movements of one file, and still dedupes them later", () => {
    importRows([row(), row()]);
    expect(listTransactions(db)).toHaveLength(2);

    const again = importRows([row(), row()]);

    expect(again.newCount).toBe(0);
    expect(listTransactions(db)).toHaveLength(2);
  });

  it("dedupes on the bank identifier even when the label changed", () => {
    importRows([row({ externalId: "FIT-1" })]);

    const result = importRows([row({ externalId: "FIT-1", label: "CARD SHOP 2" })]);

    expect(result.duplicateCount).toBe(1);
  });

  it("does not treat another account's movement as a duplicate", () => {
    const other = createAccount(db, {
      name: "Other",
      kind: "checking",
      currency: "EUR",
      openingDate: "2026-01-01",
      openingBalance: 0,
    });
    importRows([row()]);

    const result = commitImport(db, {
      accountId: other.id,
      format: "ofx",
      fileName: "other.ofx",
      mapping: null,
      rows: [row()],
      now: NOW,
    });

    expect(result.newCount).toBe(1);
  });

  it("accepts an income above the ceiling and reports the excess", () => {
    const savings = createAccount(db, {
      name: "Livret",
      kind: "savings",
      currency: "EUR",
      openingDate: "2026-01-01",
      openingBalance: 150_000,
      depositCeiling: 160_000,
    });

    const result = commitImport(db, {
      accountId: savings.id,
      format: "ofx",
      fileName: "livret.ofx",
      mapping: null,
      rows: [row({ amount: 20_000, label: "DEPOSIT" })],
      now: NOW,
    });

    expect(result.newCount).toBe(1);
    expect(result.ceilingWarnings).toEqual([{ label: "DEPOSIT", date: "2026-02-01", excess: 10_000 }]);
  });

  it("counts earlier rows of the file toward the ceiling", () => {
    const savings = createAccount(db, {
      name: "Livret",
      kind: "savings",
      currency: "EUR",
      openingDate: "2026-01-01",
      openingBalance: 0,
      depositCeiling: 10_000,
    });

    const preview = previewImport(db, {
      accountId: savings.id,
      rows: [
        row({ amount: 8_000, label: "FIRST" }),
        row({ date: "2026-02-02", amount: 8_000, label: "SECOND" }),
      ],
    });

    expect(preview.ceilingWarnings).toEqual([
      { label: "SECOND", date: "2026-02-02", excess: 6_000 },
    ]);
  });

  it("accepts an import on an archived account and flags it", () => {
    archiveAccount(db, accountId);

    const result = importRows([row({ amount: 0 + 1, label: "LATE" })]);

    expect(result.newCount).toBe(1);
    expect(result.accountArchived).toBe(true);
  });

  it("writes nothing when previewing", () => {
    const preview = previewImport(db, { accountId, rows: [row(), row({ label: "B" })] });

    expect(preview).toMatchObject({ newCount: 2, duplicateCount: 0 });
    expect(listTransactions(db)).toEqual([]);
    expect(listImportBatches(db, accountId)).toEqual([]);
  });

  it("previews duplicates of an earlier import", () => {
    importRows([row()]);

    const preview = previewImport(db, { accountId, rows: [row(), row({ label: "B" })] });

    expect(preview).toMatchObject({ newCount: 1, duplicateCount: 1 });
  });

  it("offers the mapping of the latest CSV import again", () => {
    importRows([row()], MAPPING);
    importRows([row({ label: "B" })], { ...MAPPING, dateFormat: "ymd" });

    expect(getLastCsvMapping(db, accountId)).toEqual({ ...MAPPING, dateFormat: "ymd" });
  });

  it("offers no mapping before any CSV import", () => {
    importRows([row()]);

    expect(getLastCsvMapping(db, accountId)).toBeNull();
  });

  it("ignores a stored mapping that no longer validates", () => {
    importRows([row()], MAPPING);
    db.update(importBatches).set({ mapping: '{"delimiter":"|"}' }).where(eq(importBatches.accountId, accountId)).run();

    expect(getLastCsvMapping(db, accountId)).toBeNull();
  });

  it("rolls back the whole import when one row cannot be stored", () => {
    expect(() => importRows([row(), row({ date: "not-a-date" })])).toThrow();

    expect(listTransactions(db)).toEqual([]);
    expect(listImportBatches(db, accountId)).toEqual([]);
  });
});
