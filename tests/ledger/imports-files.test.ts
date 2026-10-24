import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  applyCsvMapping,
  detectDelimiter,
  parseCsv,
  suggestCsvMapping,
} from "../../src/domain/import-csv";
import { parseOfx } from "../../src/domain/import-ofx";
import { createAccount, getAccountBalance } from "../../src/ledger/accounts";
import { commitImport } from "../../src/ledger/imports";
import { listTransactions } from "../../src/ledger/transactions";
import {
  type AppDatabase,
  migrateDatabase,
  openDatabase,
} from "../../src/storage/database";

const FIXTURES = path.join(process.cwd(), "tests", "fixtures");

function readFixture(name: string): string {
  return readFileSync(path.join(FIXTURES, name), "utf8");
}

describe("importing statement files", () => {
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

  function importCsv() {
    const text = readFixture("statement.csv");
    const delimiter = detectDelimiter(text);
    const rows = parseCsv(text, delimiter);
    const mapping = suggestCsvMapping(rows[0] ?? [], delimiter);
    if (mapping === null) throw new Error("The fixture header should be recognized");
    const reading = applyCsvMapping(rows, mapping, "EUR");
    expect(reading.errors).toEqual([]);
    return commitImport(db, {
      accountId,
      format: "csv",
      fileName: "statement.csv",
      mapping,
      rows: reading.rows,
      now: new Date("2026-03-01T10:00:00Z"),
    });
  }

  function importOfx() {
    return commitImport(db, {
      accountId,
      format: "ofx",
      fileName: "statement.ofx",
      mapping: null,
      rows: parseOfx(readFixture("statement.ofx"), "EUR"),
      now: new Date("2026-03-01T10:00:00Z"),
    });
  }

  it("imports a CSV export once, keeping identical movements, and ignores it the second time", () => {
    expect(importCsv()).toMatchObject({ newCount: 4, duplicateCount: 0 });
    expect(getAccountBalance(db, accountId)).toBe(114_388 - 3 * 1_250);

    expect(importCsv()).toMatchObject({ newCount: 0, duplicateCount: 4 });
    expect(listTransactions(db)).toHaveLength(4);
  });

  it("imports an OFX export once and ignores it the second time", () => {
    expect(importOfx()).toMatchObject({ newCount: 2, duplicateCount: 0 });
    expect(getAccountBalance(db, accountId)).toBe(114_388 - 1_250);

    expect(importOfx()).toMatchObject({ newCount: 0, duplicateCount: 2 });
    expect(listTransactions(db)).toHaveLength(2);
  });
});
