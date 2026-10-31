import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { ImportDraft } from "../../src/domain/import-draft";
import { createAccount } from "../../src/ledger/accounts";
import { listImportBatches } from "../../src/ledger/imports";
import { commitDrafts } from "../../src/ledger/staged-import";
import { listTransactions } from "../../src/ledger/transactions";
import {
  type AppDatabase,
  migrateDatabase,
  openDatabase,
} from "../../src/storage/database";

const NOW = new Date("2026-03-01T10:00:00Z");

function draft(overrides: Partial<ImportDraft> = {}): ImportDraft {
  return {
    date: "2026-02-01",
    label: "CARD SHOP",
    amount: "-12,50",
    externalId: null,
    ...overrides,
  };
}

describe("commitDrafts", () => {
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

  function commit(drafts: ImportDraft[], fileName = "2026-02.csv") {
    return commitDrafts(db, {
      accountId,
      format: "csv",
      fileName,
      mapping: null,
      drafts,
      now: NOW,
    });
  }

  it("records the edited rows as one batch named after the file", () => {
    const result = commit([
      draft(),
      draft({ date: "2026-02-05", label: "SALARY", amount: "1 143,88 €" }),
    ]);

    expect(result).toMatchObject({
      status: "done",
      newCount: 2,
      duplicateCount: 0,
    });
    expect(
      listTransactions(db).map((t) => [t.date, t.label, t.amount]),
    ).toEqual([
      ["2026-02-01", "CARD SHOP", -1_250],
      ["2026-02-05", "SALARY", 114_388],
    ]);
    expect(listImportBatches(db, accountId).map((b) => b.fileName)).toEqual([
      "2026-02.csv",
    ]);
  });

  it("records nothing and names every row that is still wrong", () => {
    const result = commit([
      draft(),
      draft({ date: "" }),
      draft({ label: " " }),
      draft({ amount: "0" }),
    ]);

    expect(result).toEqual({
      status: "invalid",
      problems: [
        { index: 1, problem: "dateInvalid" },
        { index: 2, problem: "labelRequired" },
        { index: 3, problem: "amountZero" },
      ],
    });
    expect(listTransactions(db)).toEqual([]);
    expect(listImportBatches(db, accountId)).toEqual([]);
  });

  it("ignores the rows already in the account, as an import does", () => {
    commit([draft()]);

    const second = commit(
      [draft(), draft({ label: "BAKERY", amount: "-3,20" })],
      "again.csv",
    );

    expect(second).toMatchObject({
      status: "done",
      newCount: 1,
      duplicateCount: 1,
    });
    expect(listTransactions(db)).toHaveLength(2);
  });

  it("records no batch when every row is already there", () => {
    commit([draft()]);

    const second = commit([draft()], "again.csv");

    expect(second).toMatchObject({
      status: "done",
      newCount: 0,
      batchId: null,
    });
    expect(listImportBatches(db, accountId)).toHaveLength(1);
  });
});
