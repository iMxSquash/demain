import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { resolveOccurrences } from "../../src/domain/occurrence-resolution";
import type { MatchPair } from "../../src/domain/planned-matching";
import type { PlannedItemInput } from "../../src/domain/planned-item";
import { createAccount } from "../../src/ledger/accounts";
import { createCategory } from "../../src/ledger/categories";
import { createRule } from "../../src/ledger/categorization-rules";
import { ImportBatchNotFoundError } from "../../src/ledger/import-batch-lookup";
import { commitImport, type ImportRow } from "../../src/ledger/imports";
import {
  cancelPlannedItem,
  createPlannedItem,
  getPlannedItem,
  toPlannedSchedule,
} from "../../src/ledger/planned-items";
import {
  confirmMatch,
  linkByHand,
  linkTransactionToOccurrence,
  listBatchMatches,
  listLinkCandidates,
  PlannedLinkError,
  undoMatch,
  unlinkByHand,
  unlinkTransaction,
} from "../../src/ledger/planned-matching";
import {
  createTransaction,
  createTransfer,
  getTransaction,
  listTransactions,
  type Transaction,
} from "../../src/ledger/transactions";
import { type AppDatabase, migrateDatabase, openDatabase } from "../../src/storage/database";
import { occurrenceOverrides } from "../../src/storage/schema";

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
    const { gymA, gymB, batchId } = importMixedBatch();
    const streamingRow = transactionLabelled("STREAMING");
    const gymRow = transactionLabelled("GYM");

    const result = listBatchMatches(db, batchId, TODAY);

    expect(result.matched).toEqual([
      {
        transactionId: streamingRow.id,
        label: "STREAMING",
        date: "2026-03-10",
        amount: -1_299,
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

  it("confirming a proposed pair links a fill-up of a provision", () => {
    const provision = monthlyItem({
      name: "Fuel",
      acceptsMultipleTransactions: true,
      startDate: "2026-03-15",
      repetition: { kind: "monthly_on_day", day: 15 },
      amount: -9_000,
    });
    const batchId = importFile([
      row("2026-03-03", -4_500, "STATION NORTH"),
      row("2026-03-20", -3_800, "STATION SOUTH"),
    ]);
    const north = transactionLabelled("STATION NORTH");
    undoMatch(db, batchId, north.id);
    const pair = {
      transactionId: north.id,
      plannedItemId: provision.id,
      nominalDate: "2026-03-15",
    };

    confirmMatch(db, batchId, pair, TODAY);

    expect(transactionLabelled("STATION NORTH")).toMatchObject({
      plannedItemId: provision.id,
      occurrenceDate: "2026-03-15",
    });
    expect(transactionLabelled("STATION SOUTH").plannedItemId).toBe(provision.id);
    expect(listBatchMatches(db, batchId, TODAY).groups).toEqual([]);
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

  it("refuses to undo in an unknown batch", () => {
    importMixedBatch();
    const streamingRow = transactionLabelled("STREAMING");

    expect(catchError(() => undoMatch(db, 9_999, streamingRow.id))).toBeInstanceOf(
      ImportBatchNotFoundError,
    );
    expect(transactionLabelled("STREAMING").plannedItemId).not.toBeNull();
  });

  it("refuses to undo a transaction that is not linked", () => {
    const { batchId } = importMixedBatch();
    const gymRow = transactionLabelled("GYM");

    const error = catchError(() => undoMatch(db, batchId, gymRow.id));

    expect(refOf(error)).toBe("matchNotInBatch");
  });
});

describe("linking a transaction to an occurrence by hand", () => {
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

  /** An item with a single occurrence on `date`, which settles after a window of two days. */
  function oneOffItem(name: string, date: string, overrides: Partial<PlannedItemInput> = {}) {
    return createPlannedItem(db, {
      name,
      kind: "expense",
      accountId: checkingId,
      startDate: date,
      endDate: date,
      repetition: { kind: "monthly_on_day", day: Number(date.slice(8)) },
      amount: -1_000,
      matchWindowDays: 2,
      ...overrides,
    });
  }

  function enterExpense(
    date: string,
    amount: number,
    label: string,
    overrides: { accountId?: number; categoryId?: number | null } = {},
  ): Transaction {
    return createTransaction(db, {
      accountId: checkingId,
      date,
      amount,
      kind: "expense",
      label,
      ...overrides,
    });
  }

  function link(pair: MatchPair): void {
    db.transaction((tx) => linkTransactionToOccurrence(tx, pair));
  }

  function summaryOf(transactionId: number) {
    return listLinkCandidates(db, transactionId, TODAY).map(
      ({ plannedItemName, date, amount, status }) => [plannedItemName, date, amount, status],
    );
  }

  function refOf(error: unknown): unknown {
    expect(error).toBeInstanceOf(PlannedLinkError);
    return (error as PlannedLinkError).ref.key;
  }

  it("lists the planned and overdue occurrences of the account, sorted by distance", () => {
    createPlannedItem(db, {
      name: "Rent",
      kind: "expense",
      accountId: checkingId,
      startDate: "2026-01-10",
      endDate: "2026-04-10",
      repetition: { kind: "monthly_on_day", day: 10 },
      amount: -80_000,
      matchWindowDays: 2,
    });
    oneOffItem("Phone", "2026-03-05", { amount: -2_000 });
    oneOffItem("Gym", "2026-03-20", { amount: -999 });
    const shop = enterExpense("2026-03-12", -5_000, "SHOP");

    const result = summaryOf(shop.id);

    expect(result).toEqual([
      ["Rent", "2026-03-10", -80_000, "planned"],
      ["Phone", "2026-03-05", -2_000, "overdue"],
      ["Gym", "2026-03-20", -999, "planned"],
      ["Rent", "2026-04-10", -80_000, "planned"],
      ["Rent", "2026-02-10", -80_000, "overdue"],
      ["Rent", "2026-01-10", -80_000, "overdue"],
    ]);
  });

  it("describes a candidate with a pair ready to link", () => {
    const phone = oneOffItem("Phone", "2026-03-05", { amount: -2_000 });
    const shop = enterExpense("2026-03-12", -5_000, "SHOP");

    const [candidate] = listLinkCandidates(db, shop.id, TODAY);

    expect(candidate).toEqual({
      pair: { transactionId: shop.id, plannedItemId: phone.id, nominalDate: "2026-03-05" },
      plannedItemName: "Phone",
      nominalDate: "2026-03-05",
      date: "2026-03-05",
      amount: -2_000,
      status: "overdue",
    });
  });

  it("excludes settled, cancelled, other-account and opposite-sign occurrences", () => {
    const settled = oneOffItem("Settled", "2026-03-10");
    const paid = enterExpense("2026-03-10", -1_000, "PAID");
    link({ transactionId: paid.id, plannedItemId: settled.id, nominalDate: "2026-03-10" });
    const cancelledOccurrence = oneOffItem("Cancelled occurrence", "2026-03-11");
    db.insert(occurrenceOverrides)
      .values({
        plannedItemId: cancelledOccurrence.id,
        nominalDate: "2026-03-11",
        status: "cancelled",
      })
      .run();
    const cancelledItem = oneOffItem("Cancelled item", "2026-03-09");
    cancelPlannedItem(db, cancelledItem.id);
    oneOffItem("Joint account", "2026-03-12", { accountId: jointId });
    oneOffItem("Salary", "2026-03-13", { kind: "income", amount: 2_000 });
    oneOffItem("Valid", "2026-03-14", { amount: -3_000 });
    const shop = enterExpense("2026-03-12", -5_000, "SHOP");

    const result = summaryOf(shop.id);

    expect(result).toEqual([["Valid", "2026-03-14", -3_000, "planned"]]);
  });

  it("links a transaction entered by hand to an overdue occurrence, which becomes confirmed", () => {
    const electricity = oneOffItem("Electricity", "2026-02-05", { amount: -4_200 });
    const bill = enterExpense("2026-03-12", -4_100, "ELECTRICITY BILL");
    const other = enterExpense("2026-03-13", -300, "OTHER");
    const [candidate] = listLinkCandidates(db, bill.id, TODAY);
    expect(candidate).toMatchObject({ plannedItemName: "Electricity", status: "overdue" });

    link(candidate!.pair);

    expect(getTransaction(db, bill.id)).toMatchObject({
      plannedItemId: electricity.id,
      occurrenceDate: "2026-02-05",
    });
    expect(listLinkCandidates(db, other.id, TODAY)).toEqual([]);
    const planned = getPlannedItem(db, electricity.id);
    const resolved = resolveOccurrences(
      {
        schedule: toPlannedSchedule(planned),
        overrides: planned.overrides,
        matchWindowDays: planned.matchWindowDays,
        acceptsMultipleTransactions: planned.acceptsMultipleTransactions,
      },
      [
        {
          transactionId: bill.id,
          occurrenceDate: "2026-02-05",
          date: "2026-03-12",
          amount: -4_100,
        },
      ],
      { from: "2026-02-01", to: "2026-02-28" },
      TODAY,
    );
    expect(resolved.map(({ nominalDate, status }) => [nominalDate, status])).toEqual([
      ["2026-02-05", "confirmed"],
    ]);
  });

  it("unlinks a fill-up from a provision, whose remaining amount grows again", () => {
    const provision = oneOffItem("Fuel", "2026-03-15", {
      amount: -9_000,
      acceptsMultipleTransactions: true,
    });
    const first = enterExpense("2026-03-03", -4_500, "STATION NORTH");
    const second = enterExpense("2026-03-08", -2_000, "STATION EAST");
    const third = enterExpense("2026-03-12", -500, "STATION SOUTH");
    const nominalDate = "2026-03-15";
    link({ transactionId: first.id, plannedItemId: provision.id, nominalDate });
    link({ transactionId: second.id, plannedItemId: provision.id, nominalDate });
    expect(summaryOf(third.id)).toEqual([["Fuel", "2026-03-15", -2_500, "partial"]]);

    db.transaction((tx) => unlinkTransaction(tx, first.id));

    expect(summaryOf(third.id)).toEqual([["Fuel", "2026-03-15", -7_000, "partial"]]);
  });

  it("keeps the category of the transaction when linking by hand", () => {
    const groceries = createCategory(db, { name: "Groceries" });
    const item = oneOffItem("Groceries", "2026-03-10", { categoryId: groceries.id });
    const shop = enterExpense("2026-03-12", -1_000, "SHOP");

    db.transaction((tx) =>
      linkTransactionToOccurrence(
        tx,
        { transactionId: shop.id, plannedItemId: item.id, nominalDate: "2026-03-10" },
        { inheritCategory: false },
      ),
    );

    expect(getTransaction(db, shop.id)).toMatchObject({
      plannedItemId: item.id,
      categoryId: null,
      categoryFromPlannedItem: false,
    });
  });

  it("refuses a second transaction on a regular occurrence", () => {
    const item = oneOffItem("Rent", "2026-03-10", { amount: -80_000 });
    const itemBefore = getPlannedItem(db, item.id);
    const first = enterExpense("2026-03-10", -80_000, "RENT");
    const second = enterExpense("2026-03-11", -80_000, "RENT AGAIN");
    const pair = (transactionId: number) => ({
      transactionId,
      plannedItemId: item.id,
      nominalDate: "2026-03-10",
    });
    link(pair(first.id));

    const error = catchError(() => link(pair(second.id)));

    expect(refOf(error)).toBe("matchOccurrenceTaken");
    expect(getTransaction(db, second.id)).toMatchObject(NO_LINK);
    expect(getPlannedItem(db, item.id)).toEqual(itemBefore);
  });

  it("lists nothing for a transfer", () => {
    oneOffItem("Rent", "2026-03-10");
    const [leg] = createTransfer(db, {
      sourceId: checkingId,
      destinationId: jointId,
      amount: 1_000,
      date: "2026-03-12",
      label: "MOVE",
    });

    expect(listLinkCandidates(db, leg.id, TODAY)).toEqual([]);
  });

  it("lists nothing for a transaction that is already linked", () => {
    const item = oneOffItem("Rent", "2026-03-10");
    oneOffItem("Gym", "2026-03-11");
    const paid = enterExpense("2026-03-10", -1_000, "RENT");
    link({ transactionId: paid.id, plannedItemId: item.id, nominalDate: "2026-03-10" });

    expect(listLinkCandidates(db, paid.id, TODAY)).toEqual([]);
  });

  it("throws for an unknown transaction", () => {
    const error = catchError(() => listLinkCandidates(db, 9_999, TODAY));

    expect(refOf(error)).toBe("matchTransactionUnknown");
  });

  it("links by hand a proposed pair and leaves the category alone", () => {
    const groceries = createCategory(db, { name: "Groceries" });
    const item = oneOffItem("Groceries", "2026-03-10", { categoryId: groceries.id });
    const shop = enterExpense("2026-03-12", -1_000, "SHOP");

    linkByHand(
      db,
      { transactionId: shop.id, plannedItemId: item.id, nominalDate: "2026-03-10" },
      TODAY,
    );

    expect(getTransaction(db, shop.id)).toMatchObject({
      plannedItemId: item.id,
      occurrenceDate: "2026-03-10",
      categoryId: null,
      categoryFromPlannedItem: false,
    });
  });

  it("refuses to link by hand a pair that is not a candidate", () => {
    const item = oneOffItem("Rent", "2026-03-10");
    const shop = enterExpense("2026-03-12", -1_000, "SHOP");

    const error = catchError(() =>
      linkByHand(
        db,
        { transactionId: shop.id, plannedItemId: item.id, nominalDate: "2026-03-11" },
        TODAY,
      ),
    );

    expect(refOf(error)).toBe("matchNotProposed");
    expect(getTransaction(db, shop.id)).toMatchObject(NO_LINK);
  });

  it("refuses to link by hand a transfer, an unknown transaction or an archived account", () => {
    const item = oneOffItem("Rent", "2026-03-10");
    const [leg] = createTransfer(db, {
      sourceId: checkingId,
      destinationId: jointId,
      amount: 1_000,
      date: "2026-03-12",
      label: "MOVE",
    });
    const shop = enterExpense("2026-03-12", -1_000, "SHOP");
    const pairOf = (transactionId: number) => ({
      transactionId,
      plannedItemId: item.id,
      nominalDate: "2026-03-10",
    });

    expect(refOf(catchError(() => linkByHand(db, pairOf(leg!.id), TODAY)))).toBe(
      "matchTransactionIsTransfer",
    );
    expect(refOf(catchError(() => linkByHand(db, pairOf(9_999), TODAY)))).toBe(
      "matchTransactionUnknown",
    );
    db.$client.exec(`UPDATE accounts SET archived = 1 WHERE id = ${checkingId}`);
    const archivedError = catchError(() => linkByHand(db, pairOf(shop.id), TODAY));
    expect(archivedError).toMatchObject({ ref: { key: "transactionOnArchivedAccount" } });
    expect(getTransaction(db, shop.id)).toMatchObject(NO_LINK);
  });

  it("unlinks by hand, and refuses a transaction of an archived account", () => {
    const item = oneOffItem("Rent", "2026-03-10");
    const paid = enterExpense("2026-03-10", -1_000, "RENT");
    link({ transactionId: paid.id, plannedItemId: item.id, nominalDate: "2026-03-10" });
    db.$client.exec(`UPDATE accounts SET archived = 1 WHERE id = ${checkingId}`);

    const error = catchError(() => unlinkByHand(db, paid.id));
    expect(error).toMatchObject({ ref: { key: "transactionOnArchivedAccount" } });
    expect(getTransaction(db, paid.id).plannedItemId).toBe(item.id);

    db.$client.exec(`UPDATE accounts SET archived = 0 WHERE id = ${checkingId}`);
    unlinkByHand(db, paid.id);
    expect(getTransaction(db, paid.id)).toMatchObject(NO_LINK);
    expect(refOf(catchError(() => unlinkByHand(db, 9_999)))).toBe("matchTransactionUnknown");
  });
});
