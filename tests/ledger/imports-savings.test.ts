import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { detailsFromSign, type RowDetails } from "../../src/domain/import-draft";
import type { ImportedRow } from "../../src/domain/import-row";
import {
  createAccount,
  getAccountBalance,
  updateAccount,
} from "../../src/ledger/accounts";
import { createCategory } from "../../src/ledger/categories";
import {
  commitImport,
  ImportBlockedError,
  listImportBatches,
  previewImport,
  type ImportRow,
} from "../../src/ledger/imports";
import { listTransactions } from "../../src/ledger/transactions";
import {
  type AppDatabase,
  migrateDatabase,
  openDatabase,
} from "../../src/storage/database";

const NOW = new Date("2026-04-01T10:00:00Z");

// The ids are the ones the brief of the change uses: checking 1, A 2, B 3.
const CHECKING_ID = 1;
const A_ID = 2;
const B_ID = 3;

const AMOUNT = { currency: "EUR", openingDate: "2026-01-01" };

function savingsDetails(overrides: Partial<RowDetails> = {}): RowDetails {
  return {
    ...detailsFromSign(-1),
    type: "savings",
    savingsAccountId: A_ID,
    ...overrides,
  };
}

function savingsRow(
  overrides: Partial<ImportedRow> = {},
  details: Partial<RowDetails> = {},
): ImportRow {
  return {
    date: "2026-03-10",
    amount: -30_000,
    label: "VIR LIVRET",
    externalId: null,
    details: savingsDetails(details),
    ...overrides,
  };
}

function expenseRow(overrides: Partial<ImportRow> = {}): ImportRow {
  return {
    date: "2026-03-02",
    amount: -1_250,
    label: "CARD SHOP",
    externalId: null,
    details: detailsFromSign(-1_250),
    ...overrides,
  };
}

function catchError(action: () => unknown): unknown {
  try {
    action();
  } catch (error) {
    return error;
  }
  return null;
}

describe("importing savings rows", () => {
  let dataDir: string;
  let db: AppDatabase;

  beforeEach(() => {
    dataDir = mkdtempSync(path.join(tmpdir(), "demain-test-"));
    db = openDatabase(dataDir);
    migrateDatabase(db);
    createAccount(db, {
      ...AMOUNT,
      name: "Checking",
      kind: "checking",
      openingBalance: 100_000,
    });
    const a = createAccount(db, {
      ...AMOUNT,
      name: "A",
      kind: "savings",
      openingBalance: 90_000,
      depositCeiling: 100_000,
    });
    const b = createAccount(db, {
      ...AMOUNT,
      name: "B",
      kind: "savings",
      openingBalance: 0,
    });
    updateAccount(db, a.id, {
      ...AMOUNT,
      name: "A",
      kind: "savings",
      openingBalance: 90_000,
      depositCeiling: 100_000,
      overflowAccountId: b.id,
    });
  });

  afterEach(() => {
    db.$client.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  function importRows(rows: ImportRow[], fileName = "2026-03.csv") {
    return commitImport(db, {
      accountId: CHECKING_ID,
      format: "csv",
      fileName,
      mapping: null,
      rows,
      now: NOW,
    });
  }

  const legs = () =>
    listTransactions(db).map((t) => [t.accountId, t.amount, t.kind]);

  it("records a deposit as one linked pair per account of the chain, from the current balances", () => {
    const result = importRows([savingsRow()]);

    expect(legs()).toEqual([
      [CHECKING_ID, -10_000, "transfer"],
      [A_ID, 10_000, "transfer"],
      [CHECKING_ID, -20_000, "transfer"],
      [B_ID, 20_000, "transfer"],
    ]);
    const [first, second, third, fourth] = listTransactions(db);
    expect(first?.transferCounterpartId).toBe(second?.id);
    expect(second?.transferCounterpartId).toBe(first?.id);
    expect(third?.transferCounterpartId).toBe(fourth?.id);
    expect(fourth?.transferCounterpartId).toBe(third?.id);
    expect([
      getAccountBalance(db, CHECKING_ID),
      getAccountBalance(db, A_ID),
      getAccountBalance(db, B_ID),
    ]).toEqual([70_000, 100_000, 20_000]);
    expect(result).toMatchObject({
      newCount: 1,
      duplicateCount: 0,
      transferCount: 2,
      issues: [],
    });
  });

  it("puts the fingerprint on the first leg only and the batch on every leg", () => {
    const result = importRows([savingsRow()]);

    const all = listTransactions(db);
    expect(all.map((t) => t.importFingerprint !== null)).toEqual([
      true,
      false,
      false,
      false,
    ]);
    expect(all[0]?.accountId).toBe(CHECKING_ID);
    expect(all.every((t) => t.importBatchId === result.batchId)).toBe(true);
    expect(listImportBatches(db, CHECKING_ID)).toHaveLength(1);
  });

  it("records money coming back from savings as a withdrawal from the savings account", () => {
    importRows([savingsRow({ amount: 5_000 })]);

    expect(legs()).toEqual([
      [A_ID, -5_000, "transfer"],
      [CHECKING_ID, 5_000, "transfer"],
    ]);
    const [out, back] = listTransactions(db);
    expect(out?.transferCounterpartId).toBe(back?.id);
    // The fingerprint stays on the account that receives the file.
    expect([out?.importFingerprint === null, back?.importFingerprint !== null]).toEqual([
      true,
      true,
    ]);
    expect([getAccountBalance(db, A_ID), getAccountBalance(db, CHECKING_ID)]).toEqual([
      85_000, 105_000,
    ]);
  });

  it("takes the savings account of the request when the row names none", () => {
    commitImport(db, {
      accountId: CHECKING_ID,
      format: "csv",
      fileName: "2026-03.csv",
      mapping: null,
      savingsAccountId: A_ID,
      rows: [savingsRow({}, { savingsAccountId: null })],
      now: NOW,
    });

    expect(getAccountBalance(db, A_ID)).toBe(100_000);
  });

  it("ignores a file already imported, whatever it holds", () => {
    importRows([savingsRow(), expenseRow()]);

    const again = importRows([savingsRow(), expenseRow()], "again.csv");

    expect(again).toMatchObject({
      newCount: 0,
      duplicateCount: 2,
      batchId: null,
      transferCount: 0,
    });
    expect(listTransactions(db)).toHaveLength(5);
  });

  it("keeps two identical savings rows of one file, as two pairs", () => {
    importRows([savingsRow({ amount: -1_000 }), savingsRow({ amount: -1_000 })]);

    expect(legs()).toEqual([
      [CHECKING_ID, -1_000, "transfer"],
      [A_ID, 1_000, "transfer"],
      [CHECKING_ID, -1_000, "transfer"],
      [A_ID, 1_000, "transfer"],
    ]);
  });

  it("records nothing when a leg fails: the whole file is rolled back", () => {
    db.$client.exec(
      "create trigger refuse_b before insert on transactions when new.account_id = 3 begin select raise(abort, 'boom'); end",
    );

    expect(() => importRows([expenseRow(), savingsRow()])).toThrow(/boom/);

    expect(listTransactions(db)).toEqual([]);
    expect(listImportBatches(db, CHECKING_ID)).toEqual([]);
  });

  it("blocks the file when part of a deposit fits nowhere, and writes nothing", () => {
    updateAccount(db, A_ID, {
      ...AMOUNT,
      name: "A",
      kind: "savings",
      openingBalance: 90_000,
      depositCeiling: 100_000,
      overflowAccountId: null,
    });

    const error = catchError(() => importRows([expenseRow(), savingsRow()]));

    expect(error).toBeInstanceOf(ImportBlockedError);
    expect((error as ImportBlockedError).issues).toEqual([
      { kind: "savingsUnplaced", index: 1, amount: 20_000 },
    ]);
    expect(listTransactions(db)).toEqual([]);
    expect(listImportBatches(db, CHECKING_ID)).toEqual([]);
  });

  it("blocks the file when the chain loops, whatever the stored balances", () => {
    db.$client.exec("update accounts set overflow_account_id = 2 where id = 3");

    expect(() => importRows([savingsRow()])).toThrow(ImportBlockedError);
    expect(previewImport(db, request([savingsRow()])).issues).toEqual([
      { kind: "overflowChainCycle" },
    ]);
    expect(listTransactions(db)).toEqual([]);
  });

  it("reports the row, not a crash, when the chain reaches an archived account", () => {
    db.$client.exec("update accounts set archived = 1 where id = 3");

    const { issues } = previewImport(db, request([savingsRow()]));

    expect(issues).toEqual([
      { kind: "rowInvalid", index: 0, ref: { key: "transactionOnArchivedAccount" } },
    ]);
  });

  it("reports the row when the savings account has another currency", () => {
    db.$client.exec("update accounts set currency = 'USD' where id = 2");

    const { issues } = previewImport(db, request([savingsRow()]));

    expect(issues).toEqual([
      { kind: "rowInvalid", index: 0, ref: { key: "transferCrossCurrency" } },
    ]);
  });

  it("reports a zero amount as an invalid savings amount", () => {
    const { issues } = previewImport(db, request([savingsRow({ amount: 0 })]));

    expect(issues).toEqual([{ kind: "savingsAmountInvalid", index: 0 }]);
  });

  it("shows the planned transfers in a preview, and writes nothing", () => {
    const preview = previewImport(db, request([savingsRow()]));

    expect(preview.transfers).toEqual([
      {
        kind: "deposit",
        index: 0,
        date: "2026-03-10",
        placements: [
          { accountId: A_ID, amount: 10_000 },
          { accountId: B_ID, amount: 20_000 },
        ],
        unplaced: 0,
      },
    ]);
    expect(preview).toMatchObject({ newCount: 1, transferCount: 2, issues: [] });
    expect(listTransactions(db)).toEqual([]);
  });

  it("lets the second file see the balances the first one left", () => {
    importRows([savingsRow({ date: "2026-01-02", amount: -10_000 })], "january.csv");

    importRows([savingsRow({ date: "2026-02-01", amount: -10_000 })], "february.csv");

    expect(legs()).toEqual([
      [CHECKING_ID, -10_000, "transfer"],
      [A_ID, 10_000, "transfer"],
      [CHECKING_ID, -10_000, "transfer"],
      [B_ID, 10_000, "transfer"],
    ]);
  });

  it("imports onto an account that already holds transactions, unlike the sheet migration", () => {
    importRows([expenseRow()]);

    const result = importRows([savingsRow()], "next.csv");

    expect(result.batchId).not.toBeNull();
    expect(listTransactions(db)).toHaveLength(5);
  });

  function request(rows: ImportRow[]) {
    return { accountId: CHECKING_ID, rows };
  }
});

describe("importing rows with details", () => {
  let dataDir: string;
  let db: AppDatabase;

  beforeEach(() => {
    dataDir = mkdtempSync(path.join(tmpdir(), "demain-test-"));
    db = openDatabase(dataDir);
    migrateDatabase(db);
    createAccount(db, {
      ...AMOUNT,
      name: "Checking",
      kind: "checking",
      openingBalance: 0,
    });
  });

  afterEach(() => {
    db.$client.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  function importRows(rows: ImportRow[]) {
    return commitImport(db, {
      accountId: CHECKING_ID,
      format: "csv",
      fileName: "2026-03.csv",
      mapping: null,
      rows,
      now: NOW,
    });
  }

  it("records the type, category, payment mode and description the user chose", () => {
    const groceries = createCategory(db, { name: "Groceries" });

    importRows([
      expenseRow({
        details: {
          ...detailsFromSign(-1_250),
          categoryId: groceries.id,
          paymentMode: "card",
          description: "weekly shop",
        },
      }),
    ]);

    expect(listTransactions(db)[0]).toMatchObject({
      kind: "expense",
      categoryId: groceries.id,
      paymentMode: "card",
      description: "weekly shop",
    });
  });

  it("leaves a row without a chosen category to the rules and the to-categorize queue", () => {
    importRows([expenseRow()]);

    expect(listTransactions(db)[0]?.categoryId).toBeNull();
  });

  it("blocks the file on a type that contradicts the sign of the amount", () => {
    const rows = [expenseRow({ amount: 1_250 })];

    expect(() => importRows(rows)).toThrow(ImportBlockedError);
    expect(previewImport(db, { accountId: CHECKING_ID, rows }).issues).toEqual([
      { kind: "rowProblem", index: 0, problem: "typeSignMismatch" },
    ]);
  });

  it("blocks the file on a savings row that names no savings account", () => {
    const { issues } = previewImport(db, {
      accountId: CHECKING_ID,
      rows: [savingsRow({}, { savingsAccountId: null })],
    });

    expect(issues).toEqual([
      { kind: "rowProblem", index: 0, problem: "savingsAccountRequired" },
    ]);
  });

  it("reports a category that cannot be assigned as an invalid row", () => {
    const archived = createCategory(db, { name: "Old" });
    db.$client.exec("update categories set archived = 1");

    const { issues } = previewImport(db, {
      accountId: CHECKING_ID,
      rows: [
        expenseRow({ details: { ...detailsFromSign(-1_250), categoryId: archived.id } }),
      ],
    });

    expect(issues).toEqual([
      { kind: "rowInvalid", index: 0, ref: { key: "categoryArchived" } },
    ]);
  });
});
