import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { detailsFromSign } from "../../src/domain/import-draft";
import type { MatchPair } from "../../src/domain/planned-matching";
import type { PlannedItemInput } from "../../src/domain/planned-item";
import { createAccount, updateAccount } from "../../src/ledger/accounts";
import { createCategory } from "../../src/ledger/categories";
import { createRule } from "../../src/ledger/categorization-rules";
import { undoImportBatch } from "../../src/ledger/import-undo";
import {
  commitImport,
  ImportBlockedError,
  listImportBatches,
  type ImportRow,
} from "../../src/ledger/imports";
import { createPlannedItem, getPlannedItem } from "../../src/ledger/planned-items";
import {
  confirmMatch,
  linkTransactionToOccurrence,
  listBatchMatches,
  undoMatch,
  unlinkTransaction,
} from "../../src/ledger/planned-matching";
import {
  createTransaction,
  createTransfer,
  getTransaction,
  listTransactions,
  setTransactionCategory,
  updateTransaction,
  type Transaction,
} from "../../src/ledger/transactions";
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

describe("matching planned occurrences when a file is imported", () => {
  let dataDir: string;
  let db: AppDatabase;
  let checkingId: number;
  let otherAccountId: number;

  beforeEach(() => {
    dataDir = mkdtempSync(path.join(tmpdir(), "demain-test-"));
    db = openDatabase(dataDir);
    migrateDatabase(db);
    checkingId = createAccount(db, { ...ACCOUNT_DETAILS, name: "Checking", kind: "checking" }).id;
    otherAccountId = createAccount(db, { ...ACCOUNT_DETAILS, name: "Joint", kind: "checking" }).id;
  });

  afterEach(() => {
    db.$client.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  function importFile(rows: ImportRow[], today: string = TODAY, accountId: number = checkingId) {
    return commitImport(db, {
      accountId,
      format: "ofx",
      fileName: "statement.file",
      mapping: null,
      rows,
      now: NOW,
      today,
    });
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

  function transactionLabelled(label: string): Transaction {
    const found = listTransactions(db).find((transaction) => transaction.label === label);
    if (found === undefined) throw new Error(`No transaction labelled ${label}`);
    return found;
  }

  function linkedTransactions(): Transaction[] {
    return listTransactions(db).filter((transaction) => transaction.plannedItemId !== null);
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

  describe("a subscription", () => {
    it("is linked to its occurrence when the row is in the window and the amount tolerance", () => {
      const item = monthlyItem();

      const result = importFile([row("2026-03-11", -1_310, "STREAMING")]);

      expect(result).toMatchObject({ matchedCount: 1, proposedCount: 0 });
      expect(transactionLabelled("STREAMING")).toMatchObject({
        plannedItemId: item.id,
        occurrenceDate: "2026-03-10",
      });
    });

    it("is not linked when the row is outside the window", () => {
      monthlyItem();

      const result = importFile([row("2026-03-20", -1_299, "STREAMING")]);

      expect(result).toMatchObject({ matchedCount: 0, proposedCount: 0 });
      expect(transactionLabelled("STREAMING")).toMatchObject(NO_LINK);
    });

    it("is not linked when the amount is outside the tolerance", () => {
      monthlyItem();

      const result = importFile([row("2026-03-10", -1_800, "STREAMING")]);

      expect(result.matchedCount).toBe(0);
      expect(transactionLabelled("STREAMING")).toMatchObject(NO_LINK);
    });

    it("gives the row the category of its planned item when the row has none", () => {
      const subscriptions = createCategory(db, { name: "Subscriptions" });
      monthlyItem({ categoryId: subscriptions.id });

      importFile([row("2026-03-10", -1_299, "STREAMING")]);

      expect(transactionLabelled("STREAMING")).toMatchObject({
        categoryId: subscriptions.id,
        categoryFromPlannedItem: true,
      });
    });

    it("keeps the category a categorization rule gave and does not flag it as inherited", () => {
      const subscriptions = createCategory(db, { name: "Subscriptions" });
      const leisure = createCategory(db, { name: "Leisure" });
      createRule(db, { operator: "contains", value: "stream", categoryId: leisure.id });
      const item = monthlyItem({ categoryId: subscriptions.id });

      importFile([row("2026-03-10", -1_299, "STREAMING")]);

      expect(transactionLabelled("STREAMING")).toMatchObject({
        categoryId: leisure.id,
        categoryFromPlannedItem: false,
        plannedItemId: item.id,
      });
    });

    it("is not linked when two subscriptions of the same amount could match, only proposed", () => {
      monthlyItem({ name: "Streaming A", amount: -999 });
      monthlyItem({ name: "Streaming B", amount: -999 });

      const result = importFile([row("2026-03-10", -999, "STREAMING")]);

      expect(result.matchedCount).toBe(0);
      expect(result.proposedCount).toBeGreaterThan(0);
      expect(transactionLabelled("STREAMING")).toMatchObject(NO_LINK);
    });

    it("is not linked when the planned item is on another account", () => {
      monthlyItem({ accountId: otherAccountId });

      const result = importFile([row("2026-03-10", -1_299, "STREAMING")]);

      expect(result).toMatchObject({ matchedCount: 0, proposedCount: 0 });
      expect(transactionLabelled("STREAMING")).toMatchObject(NO_LINK);
    });
  });

  describe("a provision", () => {
    it("links every fill-up of the month to its occurrence", () => {
      const fuel = createCategory(db, { name: "Fuel" });
      const bakery = createCategory(db, { name: "Bakery" });
      createRule(db, { operator: "contains", value: "station", categoryId: fuel.id });
      createRule(db, { operator: "contains", value: "bakery", categoryId: bakery.id });
      const provision = monthlyItem({
        name: "Fuel",
        categoryId: fuel.id,
        acceptsMultipleTransactions: true,
        startDate: "2026-03-15",
        repetition: { kind: "monthly_on_day", day: 15 },
        amount: -9_000,
      });

      const result = importFile([
        row("2026-02-27", -4_000, "STATION BEFORE"),
        row("2026-03-03", -4_500, "STATION NORTH"),
        row("2026-03-20", -3_800, "STATION SOUTH"),
        row("2026-03-28", -5_000, "STATION EAST"),
        row("2026-03-09", -450, "BAKERY"),
      ]);

      expect(result).toMatchObject({ matchedCount: 3, proposedCount: 0 });
      const linked = linkedTransactions();
      expect(linked.map((transaction) => transaction.label).sort()).toEqual([
        "STATION EAST",
        "STATION NORTH",
        "STATION SOUTH",
      ]);
      expect(linked.every((transaction) => transaction.plannedItemId === provision.id)).toBe(true);
      expect(linked.every((transaction) => transaction.occurrenceDate === "2026-03-15")).toBe(true);
    });
  });

  describe("a planned transfer", () => {
    const SAVINGS_LABEL = "TO SAVINGS";
    let savingsId: number;
    let overflowId: number;

    beforeEach(() => {
      const savings = {
        ...ACCOUNT_DETAILS,
        name: "Savings",
        kind: "savings",
        openingBalance: 90_000,
        depositCeiling: 100_000,
      } as const;
      savingsId = createAccount(db, savings).id;
      overflowId = createAccount(db, {
        ...ACCOUNT_DETAILS,
        name: "Overflow",
        kind: "savings",
        openingBalance: 0,
      }).id;
      updateAccount(db, savingsId, { ...savings, overflowAccountId: overflowId });
    });

    function savingsRow(date: string, amount: number): ImportRow {
      return {
        ...row(date, amount, SAVINGS_LABEL),
        details: { ...detailsFromSign(-1), type: "savings", savingsAccountId: savingsId },
      };
    }

    function monthlyTransfer(overrides: Partial<PlannedItemInput> = {}) {
      return monthlyItem({
        name: "Savings plan",
        kind: "transfer",
        destinationAccountId: savingsId,
        amount: -5_000,
        ...overrides,
      });
    }

    /** The legs of the savings rows, in id order. */
    function savingsTransactions(): Transaction[] {
      return listTransactions(db)
        .filter((transaction) => transaction.label === SAVINGS_LABEL)
        .sort((a, b) => a.id - b.id);
    }

    function savingsLegs() {
      return savingsTransactions().map((leg) => [
        leg.accountId,
        leg.amount,
        leg.plannedItemId,
        leg.occurrenceDate,
      ]);
    }

    it("a monthly savings transfer imported as one pair settles its planned transfer", () => {
      const item = monthlyTransfer();

      const result = importFile([savingsRow("2026-03-11", -5_000)]);

      expect(result).toMatchObject({ transferCount: 1, matchedCount: 1, proposedCount: 0 });
      expect(savingsLegs()).toEqual([
        [checkingId, -5_000, item.id, "2026-03-10"],
        [savingsId, 5_000, null, null],
      ]);
    });

    it("a savings row split into two outgoing legs along the chain settles its planned transfer through the row sum", () => {
      // The savings account holds 90_000 of a 100_000 ceiling: 10_000 fit, 20_000 overflow.
      const item = monthlyTransfer({ amount: -30_000 });

      const result = importFile([savingsRow("2026-03-11", -30_000)]);

      expect(result).toMatchObject({ transferCount: 2, matchedCount: 1, proposedCount: 0 });
      expect(savingsLegs()).toEqual([
        [checkingId, -10_000, item.id, "2026-03-10"],
        [savingsId, 10_000, null, null],
        [checkingId, -20_000, item.id, "2026-03-10"],
        [overflowId, 20_000, null, null],
      ]);
    });

    /**
     * Imports one savings row of 30_000, split in two along the chain, that two planned transfers of
     * that amount both fit. The row is named by its first outgoing leg.
     */
    function importAmbiguousRow() {
      monthlyTransfer({ amount: -30_000 });
      const other = monthlyTransfer({ name: "Holiday fund", amount: -30_000 });
      const { batchId, matchedCount, proposedCount } = importFile([
        savingsRow("2026-03-11", -30_000),
      ]);
      const [firstLeg] = savingsTransactions();
      if (batchId === null || firstLeg === undefined) throw new Error("No savings row imported");
      return {
        batchId,
        matchedCount,
        proposedCount,
        otherId: other.id,
        transactionId: firstLeg.id,
      };
    }

    it("two planned transfers of the same amount are proposed, not confirmed", () => {
      const { batchId, matchedCount, proposedCount, transactionId } = importAmbiguousRow();

      expect({ matchedCount, proposedCount }).toEqual({ matchedCount: 0, proposedCount: 1 });
      expect(savingsLegs().filter(([, , plannedItemId]) => plannedItemId !== null)).toEqual([]);
      const matches = listBatchMatches(db, batchId, TODAY);
      expect(matches.matched).toEqual([]);
      expect(
        matches.groups.map((group) =>
          group.options.map((option) => ({
            transactionId: option.pair.transactionId,
            transactionAmount: option.transactionAmount,
            transactionLabel: option.transactionLabel,
            plannedItemName: option.plannedItemName,
            givesCategory: option.givesCategory,
          })),
        ),
      ).toEqual([
        [
          {
            transactionId,
            transactionAmount: -30_000,
            transactionLabel: SAVINGS_LABEL,
            plannedItemName: "Savings plan",
            givesCategory: false,
          },
          {
            transactionId,
            transactionAmount: -30_000,
            transactionLabel: SAVINGS_LABEL,
            plannedItemName: "Holiday fund",
            givesCategory: false,
          },
        ],
      ]);
    });

    it("confirming a proposed transfer row links every outgoing leg of the row and no incoming leg", () => {
      const { batchId, otherId, transactionId } = importAmbiguousRow();

      confirmMatch(
        db,
        batchId,
        { transactionId, plannedItemId: otherId, nominalDate: "2026-03-10" },
        TODAY,
      );

      expect(savingsLegs()).toEqual([
        [checkingId, -10_000, otherId, "2026-03-10"],
        [savingsId, 10_000, null, null],
        [checkingId, -20_000, otherId, "2026-03-10"],
        [overflowId, 20_000, null, null],
      ]);
    });

    it("a confirmed transfer row is listed once, with the row sum", () => {
      const { batchId, otherId, transactionId } = importAmbiguousRow();
      confirmMatch(
        db,
        batchId,
        { transactionId, plannedItemId: otherId, nominalDate: "2026-03-10" },
        TODAY,
      );

      const matches = listBatchMatches(db, batchId, TODAY);

      expect(matches).toEqual({
        matched: [
          {
            transactionId,
            label: SAVINGS_LABEL,
            date: "2026-03-11",
            amount: -30_000,
            plannedItemName: "Holiday fund",
            nominalDate: "2026-03-10",
          },
        ],
        groups: [],
      });
    });

    it("undoing the match of a split row unlinks every outgoing leg", () => {
      const item = monthlyTransfer({ amount: -30_000 });
      const { batchId } = importFile([savingsRow("2026-03-11", -30_000)]);
      const [outgoing] = listBatchMatches(db, batchId!, TODAY).matched;

      undoMatch(db, batchId!, outgoing!.transactionId);

      expect(savingsLegs().filter(([, , plannedItemId]) => plannedItemId !== null)).toEqual([]);
      expect(listBatchMatches(db, batchId!, TODAY).groups).toEqual([
        {
          options: [
            expect.objectContaining({
              pair: {
                transactionId: outgoing!.transactionId,
                plannedItemId: item.id,
                nominalDate: "2026-03-10",
              },
              transactionAmount: -30_000,
            }),
          ],
        },
      ]);
    });

    it("undoing the match of a split row from a later outgoing leg unlinks every outgoing leg", () => {
      monthlyTransfer({ amount: -30_000 });
      const { batchId } = importFile([savingsRow("2026-03-11", -30_000)]);
      const laterOutgoing = savingsTransactions()
        .filter((leg) => leg.amount < 0)
        .at(-1)!;

      undoMatch(db, batchId!, laterOutgoing.id);

      expect(savingsLegs().filter(([, , plannedItemId]) => plannedItemId !== null)).toEqual([]);
    });

    it("a withdrawal from savings settles a planned transfer from the savings account", () => {
      const item = monthlyTransfer({
        name: "Back to checking",
        accountId: savingsId,
        destinationAccountId: checkingId,
      });

      const result = importFile([savingsRow("2026-03-11", 5_000)]);

      expect(result).toMatchObject({ transferCount: 1, matchedCount: 1, proposedCount: 0 });
      expect(savingsLegs()).toEqual([
        [savingsId, -5_000, item.id, "2026-03-10"],
        [checkingId, 5_000, null, null],
      ]);
    });

    it("two split savings rows of one batch on different dates each settle their own planned transfer", () => {
      // Overflow takes 30_000 before it passes the rest to a reserve, so that both rows split:
      // the first fills the savings account and part of the overflow, the second the rest of the
      // overflow and the reserve.
      const reserveId = createAccount(db, {
        ...ACCOUNT_DETAILS,
        name: "Reserve",
        kind: "savings",
        openingBalance: 0,
      }).id;
      updateAccount(db, overflowId, {
        ...ACCOUNT_DETAILS,
        name: "Overflow",
        kind: "savings",
        openingBalance: 0,
        depositCeiling: 30_000,
        overflowAccountId: reserveId,
      });
      const early = monthlyTransfer({
        startDate: "2026-03-05",
        repetition: { kind: "monthly_on_day", day: 5 },
        amount: -30_000,
      });
      const late = monthlyTransfer({ name: "Holiday fund", amount: -25_000 });

      const result = importFile([
        savingsRow("2026-03-05", -30_000),
        savingsRow("2026-03-11", -25_000),
      ]);

      expect(result).toMatchObject({ transferCount: 4, matchedCount: 2, proposedCount: 0 });
      expect(savingsLegs()).toEqual([
        [checkingId, -10_000, early.id, "2026-03-05"],
        [savingsId, 10_000, null, null],
        [checkingId, -20_000, early.id, "2026-03-05"],
        [overflowId, 20_000, null, null],
        [checkingId, -10_000, late.id, "2026-03-10"],
        [overflowId, 10_000, null, null],
        [checkingId, -15_000, late.id, "2026-03-10"],
        [reserveId, 15_000, null, null],
      ]);
    });

    it("a transfer leg never settles a planned expense", () => {
      monthlyItem({ name: "Rent", amount: -5_000 });

      const result = importFile([savingsRow("2026-03-11", -5_000)]);

      expect(result).toMatchObject({ matchedCount: 0, proposedCount: 0 });
      expect(linkedTransactions()).toEqual([]);
    });
  });

  describe("a refused or repeated import", () => {
    it("writes no link and no row when the file is blocked for another reason", () => {
      monthlyItem();
      const blockedSavingsRow: ImportRow = {
        ...row("2026-03-05", -2_000, "SAVINGS"),
        details: { ...detailsFromSign(-2_000), type: "savings", savingsAccountId: null },
      };

      const error = catchError(() =>
        importFile([row("2026-03-10", -1_299, "STREAMING"), blockedSavingsRow]),
      );

      expect(error).toBeInstanceOf(ImportBlockedError);
      expect(listTransactions(db)).toEqual([]);
      expect(listImportBatches(db, checkingId)).toEqual([]);
    });

    it("creates no second link when the same file is imported twice", () => {
      const item = monthlyItem();
      const rows = [row("2026-03-10", -1_299, "STREAMING")];
      importFile(rows);

      const second = importFile(rows);

      expect(second).toMatchObject({ newCount: 0, matchedCount: 0, proposedCount: 0 });
      expect(linkedTransactions().map((transaction) => transaction.plannedItemId)).toEqual([
        item.id,
      ]);
    });

    it("matches only the new rows of an overlapping file", () => {
      monthlyItem({ name: "Streaming", amount: -1_299 });
      monthlyItem({
        name: "Gym",
        amount: -2_500,
        startDate: "2026-03-12",
        repetition: { kind: "monthly_on_day", day: 12 },
      });
      importFile([row("2026-03-10", -1_299, "STREAMING")]);

      const second = importFile([
        row("2026-03-10", -1_299, "STREAMING"),
        row("2026-03-12", -2_500, "GYM"),
      ]);

      expect(second).toMatchObject({ newCount: 1, matchedCount: 1 });
      expect(linkedTransactions()).toHaveLength(2);
    });
  });

  describe("undoing the import", () => {
    it("removes the transactions after an automatic match and leaves the planned item intact", () => {
      const subscriptions = createCategory(db, { name: "Subscriptions" });
      const item = monthlyItem({ categoryId: subscriptions.id });
      const before = getPlannedItem(db, item.id);
      const { batchId } = importFile([row("2026-03-10", -1_299, "STREAMING")]);
      expect(linkedTransactions()).toHaveLength(1);

      const removed = undoImportBatch(db, batchId ?? -1);

      expect(removed).toBe(1);
      expect(listTransactions(db)).toEqual([]);
      expect(getPlannedItem(db, item.id)).toEqual(before);
    });

    it("is still allowed when a row of the file is linked by hand afterwards", () => {
      const item = monthlyItem({ amount: -5_000 });
      const { batchId } = importFile([row("2026-03-10", -1_299, "STREAMING")]);
      const imported = transactionLabelled("STREAMING");
      expect(imported).toMatchObject(NO_LINK);
      link({ transactionId: imported.id, plannedItemId: item.id, nominalDate: "2026-03-10" });

      const removed = undoImportBatch(db, batchId ?? -1);

      expect(removed).toBe(1);
      expect(listTransactions(db)).toEqual([]);
    });
  });

  describe("today", () => {
    // Three paid occurrences, then an unpaid April one: still planned on 12 April, overdue on 20 May.
    // An overdue occurrence is not a payment, so it does not feed the rolling average of May:
    // planned, it feeds its own estimate (-7000) and May expects about -5333; overdue, May expects -7000.
    const MAY_ROW = row("2026-05-10", -7_000, "ELECTRICITY");
    const APRIL_OCCURRENCE_STILL_PLANNED = "2026-04-12";
    const APRIL_OCCURRENCE_OVERDUE = "2026-05-20";

    function rollingAverageItem() {
      const item = monthlyItem({
        name: "Electricity",
        startDate: "2026-01-10",
        amount: -9_000,
        amountMode: "rolling_average",
        averageWindow: 3,
      });
      const payments = [
        ["2026-01-10", -12_000],
        ["2026-02-10", -6_000],
        ["2026-03-10", -3_000],
      ] as const;
      for (const [date, amount] of payments) {
        const paid = enterExpense(date, amount, "ELECTRICITY BILL");
        link({ transactionId: paid.id, plannedItemId: item.id, nominalDate: date });
      }
      return item;
    }

    it("does not link the row when the request's today leaves the earlier occurrence planned", () => {
      rollingAverageItem();

      const result = importFile([MAY_ROW], APRIL_OCCURRENCE_STILL_PLANNED);

      expect(result.matchedCount).toBe(0);
      expect(transactionLabelled("ELECTRICITY")).toMatchObject(NO_LINK);
    });

    it("links the same row when the request's today makes the earlier occurrence overdue", () => {
      const item = rollingAverageItem();

      const result = importFile([MAY_ROW], APRIL_OCCURRENCE_OVERDUE);

      expect(result.matchedCount).toBe(1);
      expect(transactionLabelled("ELECTRICITY")).toMatchObject({
        plannedItemId: item.id,
        occurrenceDate: "2026-05-10",
      });
    });
  });

  describe("changing the category by hand", () => {
    function importInheritedCategory() {
      const subscriptions = createCategory(db, { name: "Subscriptions" });
      const leisure = createCategory(db, { name: "Leisure" });
      monthlyItem({ categoryId: subscriptions.id });
      importFile([row("2026-03-10", -1_299, "STREAMING")]);
      const imported = transactionLabelled("STREAMING");
      expect(imported.categoryFromPlannedItem).toBe(true);
      return { imported, subscriptions, leisure };
    }

    it("clears the inherited flag when the category is set from the to-categorize paths", () => {
      const { imported, leisure } = importInheritedCategory();

      setTransactionCategory(db, imported.id, leisure.id);

      expect(getTransaction(db, imported.id)).toMatchObject({
        categoryId: leisure.id,
        categoryFromPlannedItem: false,
      });
    });

    it("clears the inherited flag when the transaction is edited with another category", () => {
      const { imported, leisure } = importInheritedCategory();

      updateTransaction(db, imported.id, {
        accountId: imported.accountId,
        date: imported.date,
        amount: imported.amount,
        kind: "expense",
        label: imported.label,
        categoryId: leisure.id,
      });

      expect(getTransaction(db, imported.id)).toMatchObject({
        categoryId: leisure.id,
        categoryFromPlannedItem: false,
      });
    });

    it("keeps the inherited flag when an edit resubmits the same category", () => {
      const { imported, subscriptions } = importInheritedCategory();

      updateTransaction(db, imported.id, {
        accountId: imported.accountId,
        date: imported.date,
        amount: imported.amount,
        kind: "expense",
        label: "Streaming, renamed",
        categoryId: subscriptions.id,
      });

      expect(getTransaction(db, imported.id)).toMatchObject({
        label: "Streaming, renamed",
        categoryId: subscriptions.id,
        categoryFromPlannedItem: true,
      });
    });

    it("keeps the inherited flag when the category already set is chosen again", () => {
      const { imported, subscriptions } = importInheritedCategory();

      setTransactionCategory(db, imported.id, subscriptions.id);

      expect(getTransaction(db, imported.id)).toMatchObject({
        categoryId: subscriptions.id,
        categoryFromPlannedItem: true,
      });
    });

    it("keeps the category on unlinking once it was chosen by hand", () => {
      const { imported, leisure } = importInheritedCategory();
      setTransactionCategory(db, imported.id, leisure.id);

      db.transaction((tx) => unlinkTransaction(tx, imported.id));

      expect(getTransaction(db, imported.id)).toMatchObject({
        ...NO_LINK,
        categoryId: leisure.id,
        categoryFromPlannedItem: false,
      });
    });
  });

  describe("unlinkTransaction", () => {
    it("clears both link columns, the inherited category and its flag", () => {
      const subscriptions = createCategory(db, { name: "Subscriptions" });
      monthlyItem({ categoryId: subscriptions.id });
      importFile([row("2026-03-10", -1_299, "STREAMING")]);
      const imported = transactionLabelled("STREAMING");

      db.transaction((tx) => unlinkTransaction(tx, imported.id));

      expect(getTransaction(db, imported.id)).toMatchObject({
        ...NO_LINK,
        categoryId: null,
        categoryFromPlannedItem: false,
      });
    });

    it("keeps a category chosen before the link", () => {
      const subscriptions = createCategory(db, { name: "Subscriptions" });
      const leisure = createCategory(db, { name: "Leisure" });
      const item = monthlyItem({ categoryId: subscriptions.id });
      const entered = enterExpense("2026-03-10", -1_299, "STREAMING", { categoryId: leisure.id });
      link({ transactionId: entered.id, plannedItemId: item.id, nominalDate: "2026-03-10" });

      db.transaction((tx) => unlinkTransaction(tx, entered.id));

      expect(getTransaction(db, entered.id)).toMatchObject({
        ...NO_LINK,
        categoryId: leisure.id,
        categoryFromPlannedItem: false,
      });
    });
  });

  describe("linkTransactionToOccurrence", () => {
    const MARCH = "2026-03-05";
    const APRIL = "2026-04-05";

    function rent() {
      return monthlyItem({
        name: "Rent",
        startDate: MARCH,
        repetition: { kind: "monthly_on_day", day: 5 },
        amount: -80_000,
      });
    }

    function refOf(error: unknown): unknown {
      expect(error).toBeInstanceOf(Error);
      return (error as { ref?: { key?: unknown } }).ref?.key;
    }

    it("sets both link columns", () => {
      const item = rent();
      const paid = enterExpense(MARCH, -80_000, "RENT");

      link({ transactionId: paid.id, plannedItemId: item.id, nominalDate: MARCH });

      expect(getTransaction(db, paid.id)).toMatchObject({
        plannedItemId: item.id,
        occurrenceDate: MARCH,
      });
    });

    it("refuses an unknown transaction", () => {
      const item = rent();

      const error = catchError(() =>
        link({ transactionId: 9_999, plannedItemId: item.id, nominalDate: MARCH }),
      );

      expect(typeof refOf(error)).toBe("string");
    });

    it("refuses a transfer", () => {
      const item = rent();
      const [leg] = createTransfer(db, {
        sourceId: checkingId,
        destinationId: otherAccountId,
        amount: 80_000,
        date: MARCH,
        label: "MOVE",
      });

      const error = catchError(() =>
        link({ transactionId: leg.id, plannedItemId: item.id, nominalDate: MARCH }),
      );

      expect(typeof refOf(error)).toBe("string");
      expect(getTransaction(db, leg.id)).toMatchObject(NO_LINK);
    });

    it("refuses a transaction that is already linked", () => {
      const item = rent();
      const paid = enterExpense(MARCH, -80_000, "RENT");
      link({ transactionId: paid.id, plannedItemId: item.id, nominalDate: MARCH });

      const error = catchError(() =>
        link({ transactionId: paid.id, plannedItemId: item.id, nominalDate: APRIL }),
      );

      expect(typeof refOf(error)).toBe("string");
      expect(getTransaction(db, paid.id).occurrenceDate).toBe(MARCH);
    });

    it("refuses a transaction on another account than the item's", () => {
      const item = rent();
      const paid = enterExpense(MARCH, -80_000, "RENT", { accountId: otherAccountId });

      const error = catchError(() =>
        link({ transactionId: paid.id, plannedItemId: item.id, nominalDate: MARCH }),
      );

      expect(typeof refOf(error)).toBe("string");
      expect(getTransaction(db, paid.id)).toMatchObject(NO_LINK);
    });

    it("refuses a second transaction on a regular occurrence", () => {
      const item = rent();
      const first = enterExpense(MARCH, -80_000, "RENT");
      const second = enterExpense("2026-03-06", -80_000, "RENT AGAIN");
      link({ transactionId: first.id, plannedItemId: item.id, nominalDate: MARCH });

      const error = catchError(() =>
        link({ transactionId: second.id, plannedItemId: item.id, nominalDate: MARCH }),
      );

      expect(typeof refOf(error)).toBe("string");
      expect(getTransaction(db, second.id)).toMatchObject(NO_LINK);
    });

    it("accepts a second transaction on a provision occurrence", () => {
      const provision = monthlyItem({
        name: "Fuel",
        acceptsMultipleTransactions: true,
        startDate: "2026-03-15",
        repetition: { kind: "monthly_on_day", day: 15 },
        amount: -9_000,
      });
      const first = enterExpense("2026-03-03", -4_500, "STATION NORTH");
      const second = enterExpense("2026-03-20", -3_800, "STATION SOUTH");

      link({ transactionId: first.id, plannedItemId: provision.id, nominalDate: "2026-03-15" });
      link({ transactionId: second.id, plannedItemId: provision.id, nominalDate: "2026-03-15" });

      expect(linkedTransactions().map((transaction) => transaction.id)).toEqual([
        first.id,
        second.id,
      ]);
    });
  });
});
