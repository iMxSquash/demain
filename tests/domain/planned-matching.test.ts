import { describe, expect, it } from "vitest";

import {
  decideMatches,
  isWithinTolerance,
  provisionLinks,
  type MatchOccurrence,
  type MatchPair,
  type MatchTransaction,
  type ProvisionOccurrence,
} from "../../src/domain/planned-matching";
import type { DateRange } from "../../src/domain/recurrence";

const ACCOUNT_ID = 1;
const OTHER_ACCOUNT_ID = 2;
const GROCERIES_CATEGORY_ID = 7;
const OTHER_CATEGORY_ID = 8;
const DEFAULT_DATE = "2026-03-05";
const DEFAULT_AMOUNT = -45000;
const DEFAULT_WINDOW_DAYS = 5;
const DEFAULT_TOLERANCE_BASIS_POINTS = 500;
const MARCH: DateRange = { from: "2026-03-01", to: "2026-03-31" };

function transaction(overrides: Partial<MatchTransaction> = {}): MatchTransaction {
  return {
    id: 1,
    accountId: ACCOUNT_ID,
    date: DEFAULT_DATE,
    amount: DEFAULT_AMOUNT,
    kind: "expense",
    categoryId: null,
    label: "Synthetic payment",
    ...overrides,
  };
}

function occurrence(overrides: Partial<MatchOccurrence> = {}): MatchOccurrence {
  return {
    plannedItemId: 1,
    nominalDate: DEFAULT_DATE,
    date: DEFAULT_DATE,
    accountId: ACCOUNT_ID,
    expectedAmount: DEFAULT_AMOUNT,
    status: "planned",
    windowDays: DEFAULT_WINDOW_DAYS,
    toleranceBasisPoints: DEFAULT_TOLERANCE_BASIS_POINTS,
    ...overrides,
  };
}

function provision(overrides: Partial<ProvisionOccurrence> = {}): ProvisionOccurrence {
  return {
    plannedItemId: 10,
    nominalDate: MARCH.to,
    period: MARCH,
    accountId: ACCOUNT_ID,
    categoryId: GROCERIES_CATEGORY_ID,
    provisionLabelFilter: null,
    ...overrides,
  };
}

function fillUp(id: number, overrides: Partial<MatchTransaction> = {}): MatchTransaction {
  return transaction({
    id,
    categoryId: GROCERIES_CATEGORY_ID,
    date: "2026-03-10",
    amount: -2000,
    ...overrides,
  });
}

function pair(transactionId: number, plannedItemId: number, nominalDate = DEFAULT_DATE): MatchPair {
  return { transactionId, plannedItemId, nominalDate };
}

describe("isWithinTolerance", () => {
  it("accepts an actual amount at the tolerance boundary", () => {
    expect(isWithinTolerance(-10500, -10000, 500)).toBe(true);
  });

  it("rejects an actual amount just beyond the tolerance", () => {
    expect(isWithinTolerance(-10501, -10000, 500)).toBe(false);
  });

  it("requires equal amounts with a zero tolerance", () => {
    expect(isWithinTolerance(-10000, -10000, 0)).toBe(true);
    expect(isWithinTolerance(-10000, -10001, 0)).toBe(false);
  });

  it("never accepts opposite signs", () => {
    expect(isWithinTolerance(-10000, 10000, 10000)).toBe(false);
    expect(isWithinTolerance(10000, -10000, 10000)).toBe(false);
  });
});

describe("decideMatches", () => {
  it("confirms a single subscription found in its window and tolerance", () => {
    const transactions = [transaction({ id: 1, date: "2026-03-07", amount: -45500 })];
    const occurrences = [occurrence({ plannedItemId: 4 })];

    const result = decideMatches(transactions, occurrences);

    expect(result).toEqual({ confirmed: [pair(1, 4)], proposed: [], unmatched: [] });
  });

  it("proposes both pairs for two subscriptions of the same amount", () => {
    const transactions = [transaction({ id: 1 })];
    const occurrences = [occurrence({ plannedItemId: 4 }), occurrence({ plannedItemId: 5 })];

    const result = decideMatches(transactions, occurrences);

    expect(result.confirmed).toEqual([]);
    expect(result.proposed).toEqual([[pair(1, 4), pair(1, 5)]]);
    expect(result.unmatched).toEqual([]);
  });

  it("proposes both pairs for two transactions of the same amount in one window", () => {
    const transactions = [transaction({ id: 1 }), transaction({ id: 2, date: "2026-03-06" })];
    const occurrences = [occurrence({ plannedItemId: 4 })];

    const result = decideMatches(transactions, occurrences);

    expect(result.confirmed).toEqual([]);
    expect(result.proposed).toEqual([[pair(1, 4), pair(2, 4)]]);
    expect(result.unmatched).toEqual([]);
  });

  it("leaves a transaction without candidate unmatched", () => {
    const transactions = [transaction({ id: 1, amount: -99900 })];
    const occurrences = [occurrence()];

    const result = decideMatches(transactions, occurrences);

    expect(result).toEqual({ confirmed: [], proposed: [], unmatched: [1] });
  });

  it("gives no decision without transactions", () => {
    const result = decideMatches([], [occurrence()]);

    expect(result).toEqual({ confirmed: [], proposed: [], unmatched: [] });
  });

  it("gives no decision without occurrences", () => {
    const result = decideMatches([], []);

    expect(result).toEqual({ confirmed: [], proposed: [], unmatched: [] });
  });

  describe("window", () => {
    it("accepts a transaction 5 days from the occurrence date", () => {
      const result = decideMatches([transaction({ date: "2026-03-10" })], [occurrence({ windowDays: 5 })]);

      expect(result.confirmed).toEqual([pair(1, 1)]);
    });

    it("rejects a transaction 6 days from the occurrence date", () => {
      const result = decideMatches([transaction({ date: "2026-03-11" })], [occurrence({ windowDays: 5 })]);

      expect(result.confirmed).toEqual([]);
      expect(result.unmatched).toEqual([1]);
    });

    it("accepts a transaction 5 days before the occurrence date", () => {
      const result = decideMatches([transaction({ date: "2026-02-28" })], [occurrence({ windowDays: 5 })]);

      expect(result.confirmed).toEqual([pair(1, 1)]);
    });

    it("accepts the same day only with a window of 0", () => {
      const sameDay = decideMatches([transaction({ date: DEFAULT_DATE })], [occurrence({ windowDays: 0 })]);
      const nextDay = decideMatches([transaction({ date: "2026-03-06" })], [occurrence({ windowDays: 0 })]);

      expect(sameDay.confirmed).toEqual([pair(1, 1)]);
      expect(nextDay.unmatched).toEqual([1]);
    });

    it("uses the adjusted or overridden date rather than the nominal date", () => {
      const moved = occurrence({ nominalDate: "2026-03-05", date: "2026-03-20", windowDays: 2 });

      const nearNominal = decideMatches([transaction({ date: "2026-03-05" })], [moved]);
      const nearMoved = decideMatches([transaction({ date: "2026-03-21" })], [moved]);

      expect(nearNominal.unmatched).toEqual([1]);
      expect(nearMoved.confirmed).toEqual([pair(1, 1, "2026-03-05")]);
    });
  });

  describe("amount", () => {
    it("never matches opposite signs", () => {
      const incomeItem = occurrence({ expectedAmount: 45000 });

      const result = decideMatches([transaction({ amount: -45000 })], [incomeItem]);

      expect(result).toEqual({ confirmed: [], proposed: [], unmatched: [1] });
    });

    it("never matches an income against an expense item", () => {
      const expenseItem = occurrence({ expectedAmount: -45000 });

      const result = decideMatches([transaction({ amount: 45000, kind: "income" })], [expenseItem]);

      expect(result).toEqual({ confirmed: [], proposed: [], unmatched: [1] });
    });

    it("does not require the kind to match, the sign is enough", () => {
      const incomeItem = occurrence({ plannedItemId: 3, expectedAmount: 1200 });

      const result = decideMatches([transaction({ amount: 1200, kind: "interest" })], [incomeItem]);

      expect(result.confirmed).toEqual([pair(1, 3)]);
    });

    it("rejects an amount outside the tolerance", () => {
      const result = decideMatches([transaction({ amount: -48000 })], [occurrence()]);

      expect(result.unmatched).toEqual([1]);
    });
  });

  describe("occurrence eligibility", () => {
    it.each(["confirmed", "partial", "cancelled"] as const)("ignores a %s occurrence", (status) => {
      const result = decideMatches([transaction()], [occurrence({ status })]);

      expect(result).toEqual({ confirmed: [], proposed: [], unmatched: [1] });
    });

    it("accepts an overdue occurrence", () => {
      const result = decideMatches([transaction()], [occurrence({ status: "overdue" })]);

      expect(result.confirmed).toEqual([pair(1, 1)]);
    });

    it("ignores an occurrence on another account", () => {
      const result = decideMatches([transaction()], [occurrence({ accountId: OTHER_ACCOUNT_ID })]);

      expect(result).toEqual({ confirmed: [], proposed: [], unmatched: [1] });
    });

    it("ignores transfers entirely", () => {
      const transfers = [transaction({ id: 1, kind: "transfer" })];

      const result = decideMatches(transfers, [occurrence()]);

      expect(result).toEqual({ confirmed: [], proposed: [], unmatched: [] });
    });

    it("does not let a transfer make a regular match ambiguous", () => {
      const transactions = [transaction({ id: 1 }), transaction({ id: 2, kind: "transfer" })];

      const result = decideMatches(transactions, [occurrence()]);

      expect(result).toEqual({ confirmed: [pair(1, 1)], proposed: [], unmatched: [] });
    });
  });

  describe("with provisions", () => {
    it("confirms several fill-ups on one provision", () => {
      const transactions = [fillUp(1), fillUp(2, { date: "2026-03-15" }), fillUp(3, { date: "2026-03-22" })];

      const result = decideMatches(transactions, [], [provision()]);

      expect(result).toEqual({
        confirmed: [pair(1, 10, MARCH.to), pair(2, 10, MARCH.to), pair(3, 10, MARCH.to)],
        proposed: [],
        unmatched: [],
      });
    });

    it("leaves a fill-up outside the provision period unmatched", () => {
      const result = decideMatches([fillUp(1, { date: "2026-04-02" })], [], [provision()]);

      expect(result).toEqual({ confirmed: [], proposed: [], unmatched: [1] });
    });

    it("proposes both pairs for a transaction fitting a provision and a regular occurrence", () => {
      const transactions = [fillUp(1, { amount: DEFAULT_AMOUNT })];
      const occurrences = [occurrence({ plannedItemId: 4 })];

      const result = decideMatches(transactions, occurrences, [provision()]);

      expect(result.confirmed).toEqual([]);
      expect(result.proposed).toEqual([[pair(1, 4), pair(1, 10, MARCH.to)]]);
      expect(result.unmatched).toEqual([]);
    });

    it("proposes both pairs for a transaction fitting two provisions", () => {
      const provisions = [provision({ plannedItemId: 10 }), provision({ plannedItemId: 11 })];

      const result = decideMatches([fillUp(1)], [], provisions);

      expect(result.confirmed).toEqual([]);
      expect(result.proposed).toEqual([[pair(1, 10, MARCH.to), pair(1, 11, MARCH.to)]]);
    });

    it("does not merge groups through a shared provision", () => {
      const transactions = [
        fillUp(1, { amount: DEFAULT_AMOUNT }),
        fillUp(2, { amount: -2000, date: "2026-03-20" }),
      ];
      const occurrences = [occurrence({ plannedItemId: 4 }), occurrence({ plannedItemId: 5 })];

      const result = decideMatches(transactions, occurrences, [provision()]);

      expect(result.confirmed).toEqual([pair(2, 10, MARCH.to)]);
      expect(result.proposed).toEqual([[pair(1, 4), pair(1, 5), pair(1, 10, MARCH.to)]]);
    });
  });

  describe("ambiguity", () => {
    it("never confirms a pair when a transaction has several candidate occurrences", () => {
      const occurrences = [occurrence({ plannedItemId: 4 }), occurrence({ plannedItemId: 5 })];

      const result = decideMatches([transaction()], occurrences);

      expect(result.confirmed).toEqual([]);
    });

    it("never confirms a pair when an occurrence has several candidate transactions", () => {
      const transactions = [transaction({ id: 1 }), transaction({ id: 2 })];

      const result = decideMatches(transactions, [occurrence()]);

      expect(result.confirmed).toEqual([]);
    });

    it("groups pairs connected through shared transactions and occurrences", () => {
      const transactions = [transaction({ id: 1 }), transaction({ id: 2 })];
      const occurrences = [occurrence({ plannedItemId: 4 }), occurrence({ plannedItemId: 5 })];

      const result = decideMatches(transactions, occurrences);

      expect(result.proposed).toEqual([[pair(1, 4), pair(1, 5), pair(2, 4), pair(2, 5)]]);
    });

    it("keeps unrelated ambiguous groups apart", () => {
      const transactions = [
        transaction({ id: 1, accountId: ACCOUNT_ID }),
        transaction({ id: 2, accountId: ACCOUNT_ID }),
        transaction({ id: 3, accountId: OTHER_ACCOUNT_ID }),
        transaction({ id: 4, accountId: OTHER_ACCOUNT_ID }),
      ];
      const occurrences = [
        occurrence({ plannedItemId: 4, accountId: ACCOUNT_ID }),
        occurrence({ plannedItemId: 5, accountId: OTHER_ACCOUNT_ID }),
      ];

      const result = decideMatches(transactions, occurrences);

      expect(result.proposed).toEqual([
        [pair(1, 4), pair(2, 4)],
        [pair(3, 5), pair(4, 5)],
      ]);
    });
  });

  describe("ordering", () => {
    it("returns the same result whatever the input order", () => {
      const transactions = [
        transaction({ id: 1 }),
        transaction({ id: 2 }),
        transaction({ id: 3, accountId: OTHER_ACCOUNT_ID, amount: -1000 }),
        transaction({ id: 4, accountId: OTHER_ACCOUNT_ID, amount: -9999 }),
        fillUp(5),
        fillUp(6, { date: "2026-03-18" }),
        transaction({ id: 7, amount: 777 }),
      ];
      const occurrences = [
        occurrence({ plannedItemId: 4 }),
        occurrence({ plannedItemId: 5 }),
        occurrence({ plannedItemId: 6, accountId: OTHER_ACCOUNT_ID, expectedAmount: -1000 }),
      ];
      const provisions = [provision()];

      const expected = decideMatches(transactions, occurrences, provisions);
      const shuffled = decideMatches(
        [...transactions].reverse(),
        [...occurrences].reverse(),
        [...provisions].reverse(),
      );

      expect(shuffled).toEqual(expected);
      expect(expected.confirmed.map((p) => p.transactionId)).toEqual([3, 5, 6]);
      expect(expected.unmatched).toEqual([4, 7]);
    });

    it("sorts pairs by transaction, planned item, then nominal date", () => {
      const occurrences = [
        occurrence({ plannedItemId: 5, nominalDate: "2026-03-05" }),
        occurrence({ plannedItemId: 4, nominalDate: "2026-03-07", date: "2026-03-07" }),
        occurrence({ plannedItemId: 4, nominalDate: "2026-03-03", date: "2026-03-03" }),
      ];

      const result = decideMatches([transaction({ id: 1 })], occurrences);

      expect(result.proposed).toEqual([[pair(1, 4, "2026-03-03"), pair(1, 4, "2026-03-07"), pair(1, 5, "2026-03-05")]]);
    });
  });
});

describe("provisionLinks", () => {
  it("links every fill-up of the period to its provision", () => {
    const transactions = [fillUp(1), fillUp(2, { date: "2026-03-31" }), fillUp(3, { date: "2026-03-01" })];

    const links = provisionLinks(transactions, [provision()]);

    expect(links).toEqual([pair(1, 10, MARCH.to), pair(2, 10, MARCH.to), pair(3, 10, MARCH.to)]);
  });

  it("ignores fill-ups outside the period", () => {
    const transactions = [fillUp(1, { date: "2026-02-28" }), fillUp(2, { date: "2026-04-01" })];

    const links = provisionLinks(transactions, [provision()]);

    expect(links).toEqual([]);
  });

  it("ignores fill-ups of another category", () => {
    const links = provisionLinks([fillUp(1, { categoryId: OTHER_CATEGORY_ID })], [provision()]);

    expect(links).toEqual([]);
  });

  it("ignores fill-ups not matching the label filter", () => {
    const filtered = provision({ provisionLabelFilter: "market" });
    const transactions = [fillUp(1, { label: "Corner market" }), fillUp(2, { label: "Pharmacy" })];

    const links = provisionLinks(transactions, [filtered]);

    expect(links).toEqual([pair(1, 10, MARCH.to)]);
  });

  it("ignores transfers", () => {
    const links = provisionLinks([fillUp(1, { kind: "transfer" })], [provision()]);

    expect(links).toEqual([]);
  });

  it("links one fill-up to every provision it fits", () => {
    const provisions = [provision({ plannedItemId: 11 }), provision({ plannedItemId: 10 })];

    const links = provisionLinks([fillUp(1)], provisions);

    expect(links).toEqual([pair(1, 10, MARCH.to), pair(1, 11, MARCH.to)]);
  });
});
