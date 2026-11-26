import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  detailsFromSign,
  type ReviewedDraft,
  type RowDetails,
} from "../../src/domain/import-draft";
import type { PlannedItemInput } from "../../src/domain/planned-item";
import { createAccount, getAccountBalance } from "../../src/ledger/accounts";
import { createCategory } from "../../src/ledger/categories";
import { createRule } from "../../src/ledger/categorization-rules";
import { undoImportBatch } from "../../src/ledger/import-undo";
import { listImportBatches } from "../../src/ledger/imports";
import { createPlannedItem } from "../../src/ledger/planned-items";
import {
  listDueOccurrences,
  listEnteredPayments,
  markOccurrencePaid,
} from "../../src/ledger/planned-matching";
import { commitDrafts } from "../../src/ledger/staged-import";
import {
  createTransaction,
  listTransactions,
  type Transaction,
} from "../../src/ledger/transactions";
import { type AppDatabase, migrateDatabase, openDatabase } from "../../src/storage/database";

const NOW = new Date("2026-03-12T10:00:00Z");
const TODAY = "2026-03-12";
const RENT_DATE = "2026-03-05";
const RENT_AMOUNT = 65_000;

function draft(
  overrides: Partial<ReviewedDraft> = {},
  details: Partial<RowDetails> = {},
): ReviewedDraft {
  return {
    date: RENT_DATE,
    label: "RENT MARCH",
    amount: "-650,00",
    externalId: null,
    details: { ...detailsFromSign(-1), ...details },
    ...overrides,
  };
}

describe("replacing an entry marked as paid by its bank row", () => {
  let dataDir: string;
  let db: AppDatabase;
  let checkingId: number;
  let housingId: number;

  beforeEach(() => {
    dataDir = mkdtempSync(path.join(tmpdir(), "demain-test-"));
    db = openDatabase(dataDir);
    migrateDatabase(db);
    checkingId = createAccount(db, {
      name: "Checking",
      kind: "checking",
      currency: "EUR",
      openingDate: "2026-01-01",
      openingBalance: 100_000,
    }).id;
    housingId = createCategory(db, { name: "Housing" }).id;
  });

  afterEach(() => {
    db.$client.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  function rentItem(overrides: Partial<PlannedItemInput> = {}) {
    return createPlannedItem(db, {
      name: "Rent",
      kind: "expense",
      accountId: checkingId,
      categoryId: housingId,
      startDate: RENT_DATE,
      repetition: { kind: "monthly_on_day", day: 5 },
      amount: -RENT_AMOUNT,
      ...overrides,
    });
  }

  function markPaid(
    plannedItemId: number,
    nominalDate = RENT_DATE,
    amount = RENT_AMOUNT,
  ): Transaction {
    markOccurrencePaid(db, { plannedItemId, nominalDate, date: nominalDate, amount }, TODAY);
    const entry = listTransactions(db).find(
      (transaction) =>
        transaction.plannedItemId === plannedItemId && transaction.occurrenceDate === nominalDate,
    );
    if (entry === undefined) throw new Error("The entry was not recorded");
    return entry;
  }

  function commit(
    drafts: ReviewedDraft[],
    replacements: { index: number; entryId: number }[] = [],
  ) {
    return commitDrafts(db, {
      accountId: checkingId,
      format: "csv",
      fileName: "2026-03.csv",
      mapping: null,
      drafts,
      replacements,
      now: NOW,
      today: TODAY,
    });
  }

  function isOpen(plannedItemId: number, nominalDate: string): boolean {
    return listDueOccurrences(db, TODAY).due.some(
      (occurrence) =>
        occurrence.plannedItemId === plannedItemId && occurrence.nominalDate === nominalDate,
    );
  }

  describe("the entries a review may offer to replace", () => {
    it("lists an entry marked as paid, with the window and the tolerance of its item", () => {
      const item = rentItem({ matchWindowDays: 3, matchAmountToleranceBp: 200 });
      const entry = markPaid(item.id);

      expect(listEnteredPayments(db)).toEqual([
        {
          id: entry.id,
          accountId: checkingId,
          categoryId: housingId,
          date: RENT_DATE,
          label: "Rent",
          kind: "expense",
          amount: -RENT_AMOUNT,
          plannedItemId: item.id,
          plannedItemName: "Rent",
          nominalDate: RENT_DATE,
          windowDays: 3,
          toleranceBasisPoints: 200,
          movements: [{ accountId: checkingId, date: RENT_DATE, amount: -RENT_AMOUNT }],
        },
      ]);
    });

    it("leaves out imported rows, unlinked entries and provisions", () => {
      const groceries = rentItem({ name: "Groceries", acceptsMultipleTransactions: true });
      markPaid(groceries.id, RENT_DATE, 4_000);
      createTransaction(db, {
        accountId: checkingId,
        date: RENT_DATE,
        amount: -2_000,
        kind: "expense",
        label: "Cafe",
      });
      const imported = rentItem({ name: "Phone", amount: -2_500 });
      commit([draft({ label: "PHONE", amount: "-25,00" })]);

      expect(
        listTransactions(db).some((transaction) => transaction.plannedItemId === imported.id),
      ).toBe(true);
      expect(listEnteredPayments(db)).toEqual([]);
    });
  });

  it("replace deletes the entry and links the bank row, which takes its category and description", () => {
    const item = rentItem();
    const entry = markPaid(item.id);
    db.$client
      .prepare("UPDATE transactions SET description = 'Paid by hand' WHERE id = ?")
      .run(entry.id);

    const result = commit([draft()], [{ index: 0, entryId: entry.id }]);

    expect(result).toMatchObject({ status: "done", replacedCount: 1, matchedCount: 1 });
    expect(listTransactions(db)).toEqual([
      expect.objectContaining({
        label: "RENT MARCH",
        amount: -RENT_AMOUNT,
        plannedItemId: item.id,
        occurrenceDate: RENT_DATE,
        categoryId: housingId,
        categoryFromPlannedItem: true,
        description: "Paid by hand",
      }),
    ]);
    expect(listTransactions(db)[0]?.importBatchId).not.toBeNull();
  });

  it("a bank row keeps the category a rule gave it and its own description", () => {
    const rentCategoryId = createCategory(db, { name: "Rent by rule" }).id;
    createRule(db, { operator: "contains", value: "rent", categoryId: rentCategoryId });
    const entry = markPaid(rentItem().id);

    commit([draft({}, { description: "From the bank" })], [{ index: 0, entryId: entry.id }]);

    expect(listTransactions(db)).toEqual([
      expect.objectContaining({
        label: "RENT MARCH",
        categoryId: rentCategoryId,
        categoryFromPlannedItem: false,
        description: "From the bank",
      }),
    ]);
  });

  it("keep both keeps two transactions, the entry still settling the occurrence", () => {
    const item = rentItem();
    const entry = markPaid(item.id);

    const result = commit([draft()]);

    expect(result).toMatchObject({ status: "done", replacedCount: 0 });
    expect(listTransactions(db)).toEqual([
      expect.objectContaining({ id: entry.id, plannedItemId: item.id, occurrenceDate: RENT_DATE }),
      expect.objectContaining({ label: "RENT MARCH", plannedItemId: null, occurrenceDate: null }),
    ]);
  });

  it("the replaced occurrence keeps its link when the bank row also fits another open occurrence", () => {
    const item = rentItem();
    const entry = markPaid(item.id);
    const other = rentItem({
      name: "Garage",
      categoryId: null,
      startDate: "2026-03-06",
      repetition: null,
    });

    commit([draft()], [{ index: 0, entryId: entry.id }]);

    expect(listTransactions(db)).toEqual([
      expect.objectContaining({
        label: "RENT MARCH",
        plannedItemId: item.id,
        occurrenceDate: RENT_DATE,
      }),
    ]);
    expect(isOpen(other.id, "2026-03-06")).toBe(true);
  });

  it("an income row replaces a received income, keeping the category chosen in the review", () => {
    const bonusCategoryId = createCategory(db, { name: "Bonus" }).id;
    const item = rentItem({ name: "Salary", kind: "income", amount: 245_000 });
    const entry = markPaid(item.id, RENT_DATE, 245_000);

    commit(
      [
        draft(
          { label: "SALARY", amount: "2 450,00" },
          { type: "income", categoryId: bonusCategoryId },
        ),
      ],
      [{ index: 0, entryId: entry.id }],
    );

    expect(listTransactions(db)).toEqual([
      expect.objectContaining({
        label: "SALARY",
        amount: 245_000,
        plannedItemId: item.id,
        categoryId: bonusCategoryId,
        categoryFromPlannedItem: false,
      }),
    ]);
  });

  it("a replaced income is not counted twice against the deposit ceiling", () => {
    db.$client
      .prepare("UPDATE accounts SET deposit_ceiling = ? WHERE id = ?")
      .run(300_000, checkingId);
    const entry = markPaid(
      rentItem({ name: "Salary", kind: "income", amount: 150_000 }).id,
      RENT_DATE,
      150_000,
    );

    const result = commit(
      [draft({ label: "SALARY", amount: "1 500,00" }, { type: "income" })],
      [{ index: 0, entryId: entry.id }],
    );

    expect(result).toMatchObject({ status: "done", ceilingWarnings: [] });
  });

  it("an entry moved to another account than its planned item is not offered", () => {
    const jointId = createAccount(db, {
      name: "Joint",
      kind: "checking",
      currency: "EUR",
      openingDate: "2026-01-01",
      openingBalance: 0,
    }).id;
    const entry = markPaid(rentItem().id);
    db.$client
      .prepare("UPDATE transactions SET account_id = ? WHERE id = ?")
      .run(jointId, entry.id);

    expect(listEnteredPayments(db)).toEqual([]);
  });

  describe("a refused file deletes nothing", () => {
    it("when another row of the file is refused", () => {
      const entry = markPaid(rentItem().id);

      const result = commit(
        [draft(), draft({ label: "BAD ROW", amount: "-3,00" }, { categoryId: 999 })],
        [{ index: 0, entryId: entry.id }],
      );

      expect(result.status).toBe("blocked");
      expect(listTransactions(db)).toEqual([expect.objectContaining({ id: entry.id })]);
      expect(listImportBatches(db, checkingId)).toEqual([]);
    });

    it("when the entry chosen is not one the row can replace", () => {
      const item = rentItem();
      const entry = markPaid(item.id);

      const result = commit([draft({ amount: "-900,00" })], [{ index: 0, entryId: entry.id }]);

      expect(result).toMatchObject({
        status: "blocked",
        issues: [{ kind: "replacementRefused", index: 0 }],
      });
      expect(listTransactions(db)).toEqual([
        expect.objectContaining({ id: entry.id, plannedItemId: item.id }),
      ]);
      expect(listImportBatches(db, checkingId)).toEqual([]);
    });

    it("when the same entry is chosen for two rows", () => {
      const entry = markPaid(rentItem().id);

      const result = commit(
        [draft(), draft({ date: "2026-03-06", label: "RENT AGAIN" })],
        [
          { index: 0, entryId: entry.id },
          { index: 1, entryId: entry.id },
        ],
      );

      expect(result).toMatchObject({
        status: "blocked",
        issues: [{ kind: "replacementRefused", index: 1 }],
      });
      expect(listTransactions(db)).toEqual([expect.objectContaining({ id: entry.id })]);
    });
  });

  it("the undo of the file restores nothing it did not create", () => {
    const item = rentItem();
    const entry = markPaid(item.id);
    const result = commit([draft()], [{ index: 0, entryId: entry.id }]);
    if (result.status !== "done" || result.batchId === null)
      throw new Error("The file was not recorded");

    expect(undoImportBatch(db, result.batchId)).toBe(1);

    expect(listTransactions(db)).toEqual([]);
    expect(isOpen(item.id, RENT_DATE)).toBe(true);
  });

  describe("a planned transfer marked as transferred", () => {
    const SAVING_AMOUNT = 30_000;
    const FIRST_CEILING = 20_000;
    let firstSavingsId: number;
    let secondSavingsId: number;

    beforeEach(() => {
      secondSavingsId = createAccount(db, {
        name: "Second savings",
        kind: "savings",
        currency: "EUR",
        openingDate: "2026-01-01",
        openingBalance: 0,
      }).id;
      firstSavingsId = createAccount(db, {
        name: "First savings",
        kind: "savings",
        currency: "EUR",
        openingDate: "2026-01-01",
        openingBalance: 0,
        depositCeiling: FIRST_CEILING,
        overflowAccountId: secondSavingsId,
      }).id;
    });

    function savingItem(overrides: Partial<PlannedItemInput> = {}) {
      return rentItem({
        name: "Monthly saving",
        kind: "transfer",
        categoryId: null,
        destinationAccountId: firstSavingsId,
        amount: -SAVING_AMOUNT,
        ...overrides,
      });
    }

    function markTransferred(plannedItemId: number): void {
      markOccurrencePaid(
        db,
        { plannedItemId, nominalDate: RENT_DATE, date: RENT_DATE, amount: SAVING_AMOUNT },
        TODAY,
        { kind: "send-surplus", accountId: secondSavingsId },
      );
    }

    function savingsDraft(amount = "-300,00", savingsAccountId = firstSavingsId): ReviewedDraft {
      return draft({ label: "TRANSFER TO SAVINGS", amount }, { type: "savings", savingsAccountId });
    }

    function balances() {
      return [checkingId, firstSavingsId, secondSavingsId].map((id) => getAccountBalance(db, id));
    }

    function enteredTransferId(): number {
      const [entry] = listEnteredPayments(db);
      if (entry?.kind !== "transfer") throw new Error("The transfer is not offered");
      return entry.id;
    }

    it("is offered as one entry for all its legs, compared as a whole", () => {
      const item = savingItem();
      markTransferred(item.id);
      const [firstOutgoing] = listTransactions(db).filter((leg) => leg.amount < 0);

      expect(listEnteredPayments(db)).toEqual([
        expect.objectContaining({
          id: firstOutgoing?.id,
          accountId: checkingId,
          kind: "transfer",
          amount: -SAVING_AMOUNT,
          plannedItemId: item.id,
          nominalDate: RENT_DATE,
          movements: expect.arrayContaining([
            { accountId: checkingId, date: RENT_DATE, amount: -FIRST_CEILING },
            { accountId: checkingId, date: RENT_DATE, amount: -(SAVING_AMOUNT - FIRST_CEILING) },
            { accountId: firstSavingsId, date: RENT_DATE, amount: FIRST_CEILING },
            { accountId: secondSavingsId, date: RENT_DATE, amount: SAVING_AMOUNT - FIRST_CEILING },
          ]),
        }),
      ]);
    });

    it("leaves out a transfer with a leg on an archived account", () => {
      markTransferred(savingItem().id);
      db.$client.prepare("UPDATE accounts SET archived = 1 WHERE id = ?").run(secondSavingsId);

      expect(listEnteredPayments(db)).toEqual([]);
    });

    it("replace deletes both legs of every pair entered by hand and links the imported outgoing legs", () => {
      const item = savingItem();
      markTransferred(item.id);

      const result = commit([savingsDraft()], [{ index: 0, entryId: enteredTransferId() }]);

      expect(result).toMatchObject({ status: "done", replacedCount: 1 });
      const legs = listTransactions(db);
      expect(legs).toHaveLength(4);
      expect(legs.every((leg) => leg.importBatchId !== null)).toBe(true);
      // Split as a fresh import would: the hand legs no longer fill the first account.
      expect(
        legs
          .filter((leg) => leg.amount > 0)
          .map(({ accountId, amount }) => ({ accountId, amount })),
      ).toEqual([
        { accountId: firstSavingsId, amount: FIRST_CEILING },
        { accountId: secondSavingsId, amount: SAVING_AMOUNT - FIRST_CEILING },
      ]);
      expect(legs.filter((leg) => leg.amount < 0)).toEqual([
        expect.objectContaining({ plannedItemId: item.id, occurrenceDate: RENT_DATE }),
        expect.objectContaining({ plannedItemId: item.id, occurrenceDate: RENT_DATE }),
      ]);
      expect(legs.filter((leg) => leg.amount > 0).every((leg) => leg.plannedItemId === null)).toBe(
        true,
      );
      expect(balances()).toEqual([
        100_000 - SAVING_AMOUNT,
        FIRST_CEILING,
        SAVING_AMOUNT - FIRST_CEILING,
      ]);
      expect(isOpen(item.id, RENT_DATE)).toBe(false);
    });

    it("is offered and replaced even when the hand entry was split another way (Q1 of #210)", () => {
      db.$client
        .prepare("UPDATE accounts SET deposit_ceiling = ? WHERE id = ?")
        .run(50_000, firstSavingsId);
      const item = savingItem();
      markTransferred(item.id);
      db.$client
        .prepare("UPDATE accounts SET deposit_ceiling = ? WHERE id = ?")
        .run(FIRST_CEILING, firstSavingsId);

      const result = commit([savingsDraft()], [{ index: 0, entryId: enteredTransferId() }]);

      expect(result).toMatchObject({ status: "done", replacedCount: 1 });
      expect(listTransactions(db)).toHaveLength(4);
      expect(balances()).toEqual([
        100_000 - SAVING_AMOUNT,
        FIRST_CEILING,
        SAVING_AMOUNT - FIRST_CEILING,
      ]);
    });

    it("replace works for a withdrawal, from the savings account it leaves", () => {
      db.$client
        .prepare("UPDATE accounts SET opening_balance = ? WHERE id = ?")
        .run(SAVING_AMOUNT, secondSavingsId);
      const item = savingItem({ accountId: secondSavingsId, destinationAccountId: checkingId });
      markTransferred(item.id);

      const result = commit(
        [savingsDraft("300,00", secondSavingsId)],
        [{ index: 0, entryId: enteredTransferId() }],
      );

      expect(result).toMatchObject({ status: "done", replacedCount: 1 });
      expect(listTransactions(db)).toEqual([
        expect.objectContaining({
          accountId: secondSavingsId,
          amount: -SAVING_AMOUNT,
          plannedItemId: item.id,
        }),
        expect.objectContaining({
          accountId: checkingId,
          amount: SAVING_AMOUNT,
          plannedItemId: null,
        }),
      ]);
      expect(balances()).toEqual([100_000 + SAVING_AMOUNT, 0, 0]);
    });

    it("keep both keeps the hand legs settling the occurrence and records the imported ones", () => {
      const item = savingItem();
      markTransferred(item.id);
      const handLegs = listTransactions(db);

      const result = commit([savingsDraft()]);

      expect(result).toMatchObject({ status: "done", replacedCount: 0 });
      const after = listTransactions(db);
      expect(after).toEqual(expect.arrayContaining(handLegs));
      expect(after.filter((leg) => leg.importBatchId !== null)).not.toHaveLength(0);
      expect(after.filter((leg) => leg.plannedItemId === item.id)).toEqual(
        handLegs.filter((leg) => leg.plannedItemId === item.id),
      );
    });

    it("a refused file deletes nothing", () => {
      markTransferred(savingItem().id);
      const handLegs = listTransactions(db);
      const entryId = enteredTransferId();

      const outside = commit([savingsDraft("-900,00")], [{ index: 0, entryId }]);
      const badRow = commit(
        [savingsDraft(), draft({ label: "BAD ROW", amount: "-3,00" }, { categoryId: 999 })],
        [{ index: 0, entryId }],
      );

      expect(outside).toMatchObject({
        status: "blocked",
        issues: [{ kind: "replacementRefused", index: 0 }],
      });
      expect(badRow.status).toBe("blocked");
      expect(listTransactions(db)).toEqual(handLegs);
      expect(listImportBatches(db, checkingId)).toEqual([]);
    });

    it("the undo of the file restores nothing it did not create", () => {
      const item = savingItem();
      markTransferred(item.id);
      const result = commit([savingsDraft()], [{ index: 0, entryId: enteredTransferId() }]);
      if (result.status !== "done" || result.batchId === null)
        throw new Error("The file was not recorded");

      expect(undoImportBatch(db, result.batchId)).toBe(4);

      expect(listTransactions(db)).toEqual([]);
      expect(balances()).toEqual([100_000, 0, 0]);
      expect(isOpen(item.id, RENT_DATE)).toBe(true);
    });
  });
});
