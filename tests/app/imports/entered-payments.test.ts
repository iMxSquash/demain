import { describe, expect, it } from "vitest";

import { enteredMatchesOf, settleEnteredChoices } from "../../../src/app/imports/entered-payments";
import { detailsFromSign } from "../../../src/domain/import-draft";
import type { EnteredPaymentEntry } from "../../../src/ledger/planned-matching";

const ACCOUNT_ID = 1;
const CONTEXT = { accountId: ACCOUNT_ID, currency: "EUR" };

function entry(overrides: Partial<EnteredPaymentEntry> = {}): EnteredPaymentEntry {
  return {
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
}

function row(amount: string, overrides: { isDuplicate?: boolean; type?: "expense" | "income" | "savings" } = {}) {
  return {
    draft: { date: "2026-12-05", label: "RENT DECEMBER", amount, externalId: null },
    details: { ...detailsFromSign(-1), type: overrides.type ?? "expense" },
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

  it("leaves out duplicates, savings rows and entries replaced by a file already imported", () => {
    const rent = entry();

    expect(enteredMatchesOf([row("-650,00", { isDuplicate: true })], CONTEXT, [rent])).toEqual([]);
    expect(enteredMatchesOf([row("-650,00", { type: "savings" })], CONTEXT, [rent])).toEqual([]);
    expect(enteredMatchesOf([row("-650,00")], CONTEXT, [rent], new Set([rent.id]))).toEqual([]);
  });
});

describe("settleEnteredChoices", () => {
  const rent = entry();
  const garage = entry({ id: 31, plannedItemId: 3, plannedItemName: "Garage" });

  it("replaces the proposed entry until the owner keeps both", () => {
    const matches = [{ rowId: 0, candidates: [rent], proposed: rent }];

    expect(settleEnteredChoices(matches, new Map())).toMatchObject({
      replacements: [{ index: 0, entryId: rent.id }],
      unsettledCount: 0,
      isEntryChosenTwice: false,
    });
    expect(settleEnteredChoices(matches, new Map([[0, null]]))).toMatchObject({
      replacements: [],
      unsettledCount: 0,
    });
  });

  it("waits for a choice when several entries fit, and ignores one no longer offered", () => {
    const matches = [{ rowId: 0, candidates: [rent, garage], proposed: null }];

    expect(settleEnteredChoices(matches, new Map()).unsettledCount).toBe(1);
    expect(settleEnteredChoices(matches, new Map([[0, 99]])).unsettledCount).toBe(1);
    expect(settleEnteredChoices(matches, new Map([[0, garage.id]])).replacements).toEqual([
      { index: 0, entryId: garage.id },
    ]);
  });

  it("says when one entry is chosen for two rows", () => {
    const matches = [
      { rowId: 0, candidates: [rent], proposed: null },
      { rowId: 1, candidates: [rent], proposed: null },
    ];

    expect(
      settleEnteredChoices(
        matches,
        new Map([
          [0, rent.id],
          [1, rent.id],
        ]),
      ).isEntryChosenTwice,
    ).toBe(true);
  });
});
