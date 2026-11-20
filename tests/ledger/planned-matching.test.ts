import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { PlannedItemInput } from "../../src/domain/planned-item";
import { createAccount } from "../../src/ledger/accounts";
import { createCategory } from "../../src/ledger/categories";
import { createRule } from "../../src/ledger/categorization-rules";
import { ImportBatchNotFoundError } from "../../src/ledger/import-batch-lookup";
import { commitImport, type ImportRow } from "../../src/ledger/imports";
import { createPlannedItem } from "../../src/ledger/planned-items";
import {
  confirmMatch,
  listBatchMatches,
  PlannedLinkError,
  undoMatch,
} from "../../src/ledger/planned-matching";
import { listTransactions, type Transaction } from "../../src/ledger/transactions";
import { type AppDatabase, migrateDatabase, openDatabase } from "../../src/storage/database";

const NOW = new Date("2026-03-12T10:00:00Z");
const TODAY = "2026-03-12";

const ACCOUNT_DETAILS = {
  currency: "EUR",
  openingDate: "2026-01-01",
  openingBalance: 100_000,
} as const;

const NO_LINK = { plannedItemId: null, occurrenceDate: null };

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

describe("reviewing the planned matches of an import batch", () => {
  let dataDir: string;
  let db: AppDatabase;
  let checkingId: number;
  let jointId: number;

  beforeEach(() => {
    dataDir = mkdtempSync(path.join(tmpdir(), "demain-test-"));
    db = openDatabase(dataDir);
    migrateDatabase(db);
    checkingId = createAccount(db, {
      ...ACCOUNT_DETAILS,
      name: "Checking",
      kind: "checking",
    }).id;
    jointId = createAccount(db, {
      ...ACCOUNT_DETAILS,
      name: "Joint",
      kind: "checking",
    }).id;
  });

  afterEach(() => {
    db.$client.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  function importFile(rows: ImportRow[], accountId: number = checkingId): number {
    const { batchId } = commitImport(db, {
      accountId,
      format: "ofx",
      fileName: "statement.file",
      mapping: null,
      rows,
      now: NOW,
      today: TODAY,
    });
    if (batchId === null) throw new Error("The import created no batch");
    return batchId;
  }

  function monthlyItem(overrides: Partial<PlannedItemInput> = {}) {
    return createPlannedItem(db, {
      name: "Streaming",
      kind: "expense",
      accountId: checkingId,
      startDate: "2026-03-10",
      repetition: { kind: "monthly_on_day", day: 10 },
      amount: -1_299,
      ...overrides,
    });
  }

  function gymItem(name: string, overrides: Partial<PlannedItemInput> = {}) {
    return monthlyItem({
      name,
      amount: -999,
      startDate: "2026-03-12",
      repetition: { kind: "monthly_on_day", day: 12 },
      ...overrides,
    });
  }

  function transactionLabelled(label: string): Transaction {
    const found = listTransactions(db).find((transaction) => transaction.label === label);
    if (found === undefined) throw new Error(`No transaction labelled ${label}`);
    return found;
  }

  function refOf(error: unknown): unknown {
    expect(error).toBeInstanceOf(PlannedLinkError);
    return (error as PlannedLinkError).ref.key;
  }

  /** A streaming subscription matched automatically and an ambiguous gym row, in one batch. */
  function importMixedBatch() {
    const streaming = monthlyItem();
    const gymA = gymItem("Gym A");
    const gymB = gymItem("Gym B");
    const batchId = importFile([
      row("2026-03-10", -1_299, "STREAMING"),
      row("2026-03-12", -999, "GYM"),
    ]);
    return { streaming, gymA, gymB, batchId };
  }

  it("lists the automatic matches of a batch and its proposed groups", () => {
    const { streaming, gymA, gymB, batchId } = importMixedBatch();
    const streamingRow = transactionLabelled("STREAMING");
    const gymRow = transactionLabelled("GYM");

    const result = listBatchMatches(db, batchId, TODAY);

    expect(result.matched).toEqual([
      {
        transactionId: streamingRow.id,
        label: "STREAMING",
        date: "2026-03-10",
        amount: -1_299,
        plannedItemId: streaming.id,
        plannedItemName: "Streaming",
        nominalDate: "2026-03-10",
      },
    ]);
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]!.options).toEqual([
      {
        pair: {
          transactionId: gymRow.id,
          plannedItemId: gymA.id,
          nominalDate: "2026-03-12",
        },
        transactionLabel: "GYM",
        transactionDate: "2026-03-12",
        transactionAmount: -999,
        plannedItemName: "Gym A",
        nominalDate: "2026-03-12",
        givesCategory: false,
      },
      {
        pair: {
          transactionId: gymRow.id,
          plannedItemId: gymB.id,
          nominalDate: "2026-03-12",
        },
        transactionLabel: "GYM",
        transactionDate: "2026-03-12",
        transactionAmount: -999,
        plannedItemName: "Gym B",
        nominalDate: "2026-03-12",
        givesCategory: false,
      },
    ]);
  });

  it("flags the options that would give the transaction a category", () => {
    const sport = createCategory(db, { name: "Sport" });
    gymItem("Gym A", { categoryId: sport.id });
    gymItem("Gym B");
    const batchId = importFile([row("2026-03-12", -999, "GYM")]);

    const [group] = listBatchMatches(db, batchId, TODAY).groups;

    expect(group!.options.map((option) => [option.plannedItemName, option.givesCategory])).toEqual([
      ["Gym A", true],
      ["Gym B", false],
    ]);
  });

  it("does not flag an option when the transaction already has a category", () => {
    const sport = createCategory(db, { name: "Sport" });
    gymItem("Gym A", { categoryId: sport.id });
    gymItem("Gym B", { categoryId: sport.id });
    createRule(db, {
      operator: "contains",
      value: "gym",
      categoryId: sport.id,
    });
    const batchId = importFile([row("2026-03-12", -999, "GYM")]);

    const [group] = listBatchMatches(db, batchId, TODAY).groups;

    expect(group!.options.every((option) => !option.givesCategory)).toBe(true);
  });

  it("refuses an unknown batch", () => {
    expect(catchError(() => listBatchMatches(db, 9_999, TODAY))).toBeInstanceOf(
      ImportBatchNotFoundError,
    );
  });

  it("confirming a proposed pair links it and removes its group", () => {
    const { gymA, batchId } = importMixedBatch();
    const gymRow = transactionLabelled("GYM");
    const pair = {
      transactionId: gymRow.id,
      plannedItemId: gymA.id,
      nominalDate: "2026-03-12",
    };

    confirmMatch(db, batchId, pair, TODAY);

    expect(transactionLabelled("GYM")).toMatchObject({
      plannedItemId: gymA.id,
      occurrenceDate: "2026-03-12",
    });
    const result = listBatchMatches(db, batchId, TODAY);
    expect(result.groups).toEqual([]);
    expect(result.matched.map((item) => item.label).sort()).toEqual(["GYM", "STREAMING"]);
  });

  it("refuses a pair that is not proposed any more", () => {
    const { gymA, batchId } = importMixedBatch();
    const gymRow = transactionLabelled("GYM");
    const pair = {
      transactionId: gymRow.id,
      plannedItemId: gymA.id,
      nominalDate: "2026-03-12",
    };
    confirmMatch(db, batchId, pair, TODAY);

    const error = catchError(() => confirmMatch(db, batchId, pair, TODAY));

    expect(refOf(error)).toBe("matchNotProposed");
    expect(transactionLabelled("GYM").plannedItemId).toBe(gymA.id);
  });

  it("refuses a pair that was never proposed and changes nothing", () => {
    const { streaming, batchId } = importMixedBatch();
    const gymRow = transactionLabelled("GYM");
    const pair = {
      transactionId: gymRow.id,
      plannedItemId: streaming.id,
      nominalDate: "2026-03-10",
    };

    const error = catchError(() => confirmMatch(db, batchId, pair, TODAY));

    expect(refOf(error)).toBe("matchNotProposed");
    expect(transactionLabelled("GYM")).toMatchObject(NO_LINK);
  });

  it("undoing an automatic match unlinks the transaction", () => {
    const { batchId } = importMixedBatch();
    const streamingRow = transactionLabelled("STREAMING");
    expect(streamingRow.plannedItemId).not.toBeNull();

    undoMatch(db, batchId, streamingRow.id);

    expect(transactionLabelled("STREAMING")).toMatchObject(NO_LINK);
    expect(listBatchMatches(db, batchId, TODAY).matched).toEqual([]);
  });

  it("lists an undone automatic match again as a proposal", () => {
    const { streaming, batchId } = importMixedBatch();
    const streamingRow = transactionLabelled("STREAMING");
    undoMatch(db, batchId, streamingRow.id);

    const { groups } = listBatchMatches(db, batchId, TODAY);

    const pairs = groups.flatMap((group) => group.options.map((option) => option.pair));
    expect(pairs).toContainEqual({
      transactionId: streamingRow.id,
      plannedItemId: streaming.id,
      nominalDate: "2026-03-10",
    });
  });

  it("refuses to undo a transaction of another batch", () => {
    const { batchId } = importMixedBatch();
    gymItem("Joint gym", { accountId: jointId });
    importFile([row("2026-03-12", -999, "JOINT GYM")], jointId);
    const other = transactionLabelled("JOINT GYM");
    expect(other.plannedItemId).not.toBeNull();

    const error = catchError(() => undoMatch(db, batchId, other.id));

    expect(refOf(error)).toBe("matchNotInBatch");
    expect(transactionLabelled("JOINT GYM").plannedItemId).toBe(other.plannedItemId);
  });

  it("refuses to undo a transaction that is not linked", () => {
    const { batchId } = importMixedBatch();
    const gymRow = transactionLabelled("GYM");

    const error = catchError(() => undoMatch(db, batchId, gymRow.id));

    expect(refOf(error)).toBe("matchNotInBatch");
  });
});
