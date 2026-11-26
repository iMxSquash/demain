import { describe, expect, it } from "vitest";

import { choiceKey, enteredMatchesOf, settleEnteredChoices } from "../../../src/app/imports/entered-payments";
import { detailsFromSign } from "../../../src/domain/import-draft";
import type { EnteredPaymentEntry } from "../../../src/ledger/planned-matching";

const ACCOUNT_ID = 1;
const CONTEXT = { accountId: ACCOUNT_ID, currency: "EUR" };

function entry(overrides: Partial<EnteredPaymentEntry> = {}): EnteredPaymentEntry {
  const base: Omit<EnteredPaymentEntry, "movements"> = {
    id: 30,
    accountId: ACCOUNT_ID,
    categoryId: null,
    date: "2026-12-05",
    label: "Rent",
    kind: "expense",
    amount: -65_000,
    plannedItemId: 2,
    plannedItemName: "Rent",
    nominalDate: "2026-12-05",
    windowDays: 5,
    toleranceBasisPoints: 500,
    ...overrides,
  };
  return { movements: [{ accountId: base.accountId, date: base.date, amount: base.amount }], ...base };
}

function row(
  amount: string,
  overrides: { isDuplicate?: boolean; type?: "expense" | "income" | "savings"; savingsAccountId?: number | null } = {},
) {
  return {
    draft: { date: "2026-12-05", label: "RENT DECEMBER", amount, externalId: null },
    details: {
      ...detailsFromSign(-1),
      type: overrides.type ?? "expense",
      savingsAccountId: overrides.savingsAccountId ?? null,
    },
    isDuplicate: overrides.isDuplicate ?? false,
    problem: null,
  };
}

describe("enteredMatchesOf", () => {
  it("flags a new row that matches an entry, by its position in the file", () => {
    const rent = entry();

    expect(enteredMatchesOf([row("-12,00"), row("-650,00")], CONTEXT, [rent])).toEqual([
      { rowId: 1, candidates: [rent], proposed: rent },
    ]);
  });

  it("reads the amount with the sign of the type", () => {
    const rent = entry();

    expect(enteredMatchesOf([row("650,00")], CONTEXT, [rent])).toHaveLength(1);
  });

  it("leaves out duplicates, savings rows against payments and entries replaced by a file already imported", () => {
    const rent = entry();

    expect(enteredMatchesOf([row("-650,00", { isDuplicate: true })], CONTEXT, [rent])).toEqual([]);
    expect(enteredMatchesOf([row("-650,00", { type: "savings" })], CONTEXT, [rent])).toEqual([]);
    expect(enteredMatchesOf([row("-650,00")], CONTEXT, [rent], new Set([rent.id]))).toEqual([]);
  });

  describe("a savings row against a planned transfer marked as transferred", () => {
    const SAVINGS_ID = 4;
    const saving = entry({
      id: 40,
      kind: "transfer",
      label: "Monthly saving",
      amount: -30_000,
      plannedItemName: "Monthly saving",
    });

    it("flags a deposit to the default savings account, compared as a whole", () => {
      const context = { ...CONTEXT, defaultSavingsAccountId: SAVINGS_ID };

      expect(enteredMatchesOf([row("-300,00", { type: "savings" })], context, [saving])).toEqual([
        { rowId: 0, candidates: [saving], proposed: saving },
      ]);
    });

    it("flags a withdrawal against a transfer leaving the savings account it names", () => {
      const fromSavings = entry({ ...saving, accountId: SAVINGS_ID });

      expect(
        enteredMatchesOf([row("300,00", { type: "savings", savingsAccountId: SAVINGS_ID })], CONTEXT, [fromSavings]),
      ).toHaveLength(1);
    });

    it("leaves out a savings row with no savings account", () => {
      expect(enteredMatchesOf([row("-300,00", { type: "savings" })], CONTEXT, [saving])).toEqual([]);
    });
  });
});

describe("settleEnteredChoices", () => {
  const rent = entry();
  const garage = entry({ id: 31, plannedItemId: 3, plannedItemName: "Garage" });
  // Row positions 0 and 1 are lines 2 and 3 of the file.
  const lineOf = (rowId: number) => rowId + 2;

  it("replaces the proposed entry until the owner keeps both", () => {
    const matches = [{ rowId: 0, candidates: [rent], proposed: rent }];

    expect(settleEnteredChoices(matches, new Map(), lineOf)).toMatchObject({
      replacements: [{ index: 0, entryId: rent.id }],
      unsettledCount: 0,
      isEntryChosenTwice: false,
    });
    expect(settleEnteredChoices(matches, new Map([[choiceKey(2, matches[0]!), null]]), lineOf)).toMatchObject({
      replacements: [],
      unsettledCount: 0,
    });
  });

  it("waits for a choice when several entries fit", () => {
    const matches = [{ rowId: 0, candidates: [rent, garage], proposed: null }];

    expect(settleEnteredChoices(matches, new Map(), lineOf).unsettledCount).toBe(1);
    expect(
      settleEnteredChoices(matches, new Map([[choiceKey(2, matches[0]!), garage.id]]), lineOf).replacements,
    ).toEqual([{ index: 0, entryId: garage.id }]);
  });

  it("follows the line of its row when the rows move", () => {
    const keepRent = new Map([[choiceKey(2, { candidates: [rent] }), null]]);

    const moved = settleEnteredChoices([{ rowId: 1, candidates: [rent], proposed: rent }], keepRent, (rowId) => rowId + 1);

    expect(moved.replacements).toEqual([]);
  });

  it("gives way to the proposal once the row offers other entries", () => {
    const keepRent = new Map([[choiceKey(2, { candidates: [rent] }), null]]);

    const changed = settleEnteredChoices([{ rowId: 0, candidates: [garage], proposed: garage }], keepRent, lineOf);

    expect(changed.replacements).toEqual([{ index: 0, entryId: garage.id }]);
  });

  it("says when one entry is chosen for two rows", () => {
    const matches = [
      { rowId: 0, candidates: [rent], proposed: null },
      { rowId: 1, candidates: [rent], proposed: null },
    ];
    const choices = new Map([
      [choiceKey(2, matches[0]!), rent.id],
      [choiceKey(3, matches[1]!), rent.id],
    ]);

    expect(settleEnteredChoices(matches, choices, lineOf).isEntryChosenTwice).toBe(true);
  });
});
