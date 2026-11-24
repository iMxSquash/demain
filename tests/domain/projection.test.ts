import { describe, expect, it } from "vitest";

import { computedBalancesAt } from "../../src/domain/balance-assertion";
import { addDays } from "../../src/domain/calendar-date";
import type { ResolvedOccurrence } from "../../src/domain/occurrence-resolution";
import {
  firstDayBelowZero,
  plannedFlows,
  projectDailyBalances,
  type DailyBalance,
  type PlannedItemOccurrences,
  type ProjectionAccount,
  type ProjectionFlow,
} from "../../src/domain/projection";
import type { DateRange } from "../../src/domain/recurrence";

const TODAY = "2026-03-10";
const CHECKING = 1;
const SAVINGS = 2;
const RENT_ITEM = 10;
const TRANSFER_ITEM = 20;
const MARCH: DateRange = { from: "2026-03-01", to: "2026-03-31" };

function occurrence(overrides: Partial<ResolvedOccurrence> = {}): ResolvedOccurrence {
  return {
    nominalDate: "2026-03-15",
    date: "2026-03-15",
    versionIndex: 0,
    amount: -45000,
    isAmountOverridden: false,
    isCancelled: false,
    expectedAmount: -45000,
    links: [],
    linkedSum: 0,
    remaining: -45000,
    status: "planned",
    period: null,
    ...overrides,
  };
}

function item(
  occurrences: readonly ResolvedOccurrence[],
  overrides: Partial<PlannedItemOccurrences> = {},
): PlannedItemOccurrences {
  return {
    plannedItemId: RENT_ITEM,
    kind: "expense",
    accountId: CHECKING,
    destinationAccountId: null,
    occurrences,
    ...overrides,
  };
}

function account(overrides: Partial<ProjectionAccount> = {}): ProjectionAccount {
  return { id: CHECKING, currency: "EUR", openingDate: "2026-01-01", openingBalance: 100000, ...overrides };
}

function transactionFlow(transactionId: number, date: string, amount: number, accountId = CHECKING): ProjectionFlow {
  return { accountId, date, amount, source: { kind: "transaction", transactionId } };
}

function occurrenceFlow(date: string, amount: number, nominalDate = date, accountId = CHECKING): ProjectionFlow {
  return { accountId, date, amount, source: { kind: "occurrence", plannedItemId: RENT_ITEM, nominalDate } };
}

function balanceOn(days: readonly DailyBalance[], date: string, accountId = CHECKING): number | undefined {
  return days.find((day) => day.date === date)?.balances.get(accountId);
}

describe("plannedFlows", () => {
  it("emits a flow with the remaining amount for a planned occurrence", () => {
    const flows = plannedFlows([item([occurrence()])], TODAY);

    expect(flows).toEqual([
      {
        accountId: CHECKING,
        date: "2026-03-15",
        amount: -45000,
        source: { kind: "occurrence", plannedItemId: RENT_ITEM, nominalDate: "2026-03-15" },
      },
    ]);
  });

  it("counts a planned occurrence dated before today at today and keeps its nominal date", () => {
    const flows = plannedFlows([item([occurrence({ nominalDate: "2026-03-05", date: "2026-03-06" })])], TODAY);

    expect(flows).toHaveLength(1);
    expect(flows[0]?.date).toBe(TODAY);
    expect(flows[0]?.source).toEqual({ kind: "occurrence", plannedItemId: RENT_ITEM, nominalDate: "2026-03-05" });
  });

  it("counts a partial provision with a past date and an open period at today", () => {
    const provision = occurrence({
      nominalDate: "2026-03-05",
      date: "2026-03-05",
      expectedAmount: -30000,
      linkedSum: -12000,
      remaining: -18000,
      status: "partial",
      period: { from: "2026-03-01", to: "2026-03-31" },
    });

    const flows = plannedFlows([item([provision])], TODAY);

    expect(flows.map((flow) => [flow.date, flow.amount])).toEqual([[TODAY, -18000]]);
  });

  it("keeps an occurrence dated today at today", () => {
    const flows = plannedFlows([item([occurrence({ nominalDate: TODAY, date: TODAY })])], TODAY);

    expect(flows.map((flow) => flow.date)).toEqual([TODAY]);
  });

  it("emits no flow when nothing remains", () => {
    const flows = plannedFlows([item([occurrence({ remaining: 0 })])], TODAY);

    expect(flows).toEqual([]);
  });

  it("emits two flows for a planned transfer, with the same source and date", () => {
    // A planned transfer is stored with a negative amount: it leaves its source account.
    const transfer = item([occurrence({ amount: -20000, expectedAmount: -20000, remaining: -20000 })], {
      plannedItemId: TRANSFER_ITEM,
      kind: "transfer",
      accountId: CHECKING,
      destinationAccountId: SAVINGS,
    });

    const flows = plannedFlows([transfer], TODAY);

    const source = { kind: "occurrence", plannedItemId: TRANSFER_ITEM, nominalDate: "2026-03-15" };
    expect(flows).toHaveLength(2);
    expect(flows).toContainEqual({ accountId: CHECKING, date: "2026-03-15", amount: -20000, source });
    expect(flows).toContainEqual({ accountId: SAVINGS, date: "2026-03-15", amount: 20000, source });
  });

  it("moves a transfer by its absolute amount whatever the sign it carries", () => {
    const transfer = item([occurrence({ remaining: 20000 })], {
      plannedItemId: TRANSFER_ITEM,
      kind: "transfer",
      accountId: CHECKING,
      destinationAccountId: SAVINGS,
    });

    const flows = plannedFlows([transfer], TODAY);

    expect(flows.map((flow) => [flow.accountId, flow.amount])).toEqual([
      [CHECKING, -20000],
      [SAVINGS, 20000],
    ]);
  });

  it("emits no flow for a transfer with nothing remaining", () => {
    const transfer = item([occurrence({ remaining: 0 })], {
      kind: "transfer",
      destinationAccountId: SAVINGS,
    });

    expect(plannedFlows([transfer], TODAY)).toEqual([]);
  });
});

describe("projectDailyBalances", () => {
  it("without planned items, the daily balances are the computed balances", () => {
    const accounts = [account(), account({ id: SAVINGS, openingBalance: 5000 })];
    const flows = [
      transactionFlow(1, "2026-03-03", -1200),
      transactionFlow(2, "2026-03-03", 300000, SAVINGS),
      transactionFlow(3, "2026-03-12", -4500),
      transactionFlow(4, "2026-03-20", 2500, SAVINGS),
    ];
    const movements = flows.map(({ accountId, date, amount }) => ({ accountId, date, amount }));

    const days = projectDailyBalances(accounts, plannedFlows([], TODAY).concat(flows), MARCH);

    expect(days).toHaveLength(31);
    for (const day of days) {
      expect(day.balances).toEqual(computedBalancesAt(accounts, movements, day.date));
    }
  });

  it("a planned expense lowers the balance from its date on", () => {
    const flows = plannedFlows([item([occurrence()])], TODAY);

    const days = projectDailyBalances([account()], flows, MARCH);

    expect(balanceOn(days, "2026-03-14")).toBe(100000);
    expect(balanceOn(days, "2026-03-15")).toBe(55000);
    expect(balanceOn(days, "2026-03-31")).toBe(55000);
  });

  it("a confirmed occurrence is not counted twice", () => {
    const settled = occurrence({
      status: "confirmed",
      remaining: 0,
      links: [{ transactionId: 7, occurrenceDate: "2026-03-15", date: "2026-03-08", amount: -45000 }],
      linkedSum: -45000,
    });
    const flows = [transactionFlow(7, "2026-03-08", -45000), ...plannedFlows([item([settled])], TODAY)];

    const days = projectDailyBalances([account()], flows, MARCH);

    expect(flows).toHaveLength(1);
    expect(balanceOn(days, "2026-03-08")).toBe(55000);
    expect(balanceOn(days, "2026-03-15")).toBe(55000);
    expect(balanceOn(days, "2026-03-31")).toBe(55000);
  });

  it("overdue and cancelled occurrences count for nothing", () => {
    const overdue = occurrence({ nominalDate: "2026-02-05", date: "2026-02-05", status: "overdue" });
    const cancelled = occurrence({ nominalDate: "2026-03-20", date: "2026-03-20", status: "cancelled", isCancelled: true });

    const flows = plannedFlows([item([overdue, cancelled])], TODAY);
    const days = projectDailyBalances([account()], flows, MARCH);

    expect(flows).toEqual([]);
    expect(days.every((day) => day.balances.get(CHECKING) === 100000)).toBe(true);
  });

  it("only the remaining amount of a partial provision is counted", () => {
    const provision = occurrence({
      nominalDate: "2026-03-25",
      date: "2026-03-25",
      expectedAmount: -30000,
      linkedSum: -12000,
      remaining: -18000,
      status: "partial",
      period: { from: "2026-03-01", to: "2026-03-31" },
    });
    const flows = [transactionFlow(5, "2026-03-04", -12000), ...plannedFlows([item([provision])], TODAY)];

    const days = projectDailyBalances([account()], flows, MARCH);

    expect(balanceOn(days, "2026-03-24")).toBe(88000);
    expect(balanceOn(days, "2026-03-25")).toBe(70000);
  });

  it("a planned transfer moves the amount from one account to the other", () => {
    const transfer = item([occurrence({ amount: -20000, expectedAmount: -20000, remaining: -20000 })], {
      plannedItemId: TRANSFER_ITEM,
      kind: "transfer",
      accountId: CHECKING,
      destinationAccountId: SAVINGS,
    });
    const accounts = [account(), account({ id: SAVINGS, openingBalance: 5000 })];

    const days = projectDailyBalances(accounts, plannedFlows([transfer], TODAY), MARCH);

    expect(balanceOn(days, "2026-03-14", CHECKING)).toBe(100000);
    expect(balanceOn(days, "2026-03-14", SAVINGS)).toBe(5000);
    expect(balanceOn(days, "2026-03-15", CHECKING)).toBe(80000);
    expect(balanceOn(days, "2026-03-15", SAVINGS)).toBe(25000);
    const total = days.map((day) => (day.balances.get(CHECKING) ?? 0) + (day.balances.get(SAVINGS) ?? 0));
    expect(new Set(total)).toEqual(new Set([105000]));
  });

  it("the range crosses a month end and 29 February 2028", () => {
    const range: DateRange = { from: "2028-02-27", to: "2028-03-02" };

    const days = projectDailyBalances([account()], [], range);

    expect(days.map((day) => day.date)).toEqual([
      "2028-02-27",
      "2028-02-28",
      "2028-02-29",
      "2028-03-01",
      "2028-03-02",
    ]);
    expect(days.some((day) => day.date === "2028-02-29")).toBe(true);
    expect(days.some((day) => day.date === "2028-02-30")).toBe(false);
  });

  it("an account opened inside the range has no balance before its opening date", () => {
    const accounts = [account(), account({ id: SAVINGS, openingDate: "2026-03-10", openingBalance: 7000 })];

    const days = projectDailyBalances(accounts, [], MARCH);

    expect(days.find((day) => day.date === "2026-03-09")?.balances.has(SAVINGS)).toBe(false);
    expect(balanceOn(days, "2026-03-10", SAVINGS)).toBe(7000);
    expect(balanceOn(days, "2026-03-09", CHECKING)).toBe(100000);
  });

  it("counts flows dated before the range in the cumulative balance", () => {
    const flows = [transactionFlow(1, "2026-02-10", -1000)];

    const days = projectDailyBalances([account()], flows, MARCH);

    expect(balanceOn(days, "2026-03-01")).toBe(99000);
  });

  it("counts a real transaction dated after today at its own date", () => {
    const flows = [transactionFlow(1, "2026-03-20", -2000)];

    const days = projectDailyBalances([account()], flows, MARCH);

    expect(balanceOn(days, "2026-03-19")).toBe(100000);
    expect(balanceOn(days, "2026-03-20")).toBe(98000);
  });

  it("ignores flows of unknown accounts", () => {
    const flows = [transactionFlow(1, "2026-03-05", -2000, 99)];

    const days = projectDailyBalances([account()], flows, MARCH);

    expect(days.every((day) => day.balances.size === 1 && day.balances.get(CHECKING) === 100000)).toBe(true);
  });

  it("does not depend on the order of the flows", () => {
    const flows = [
      transactionFlow(1, "2026-03-03", -1200),
      occurrenceFlow("2026-03-15", -45000),
      transactionFlow(2, "2026-03-03", 3000),
      transactionFlow(3, "2026-02-20", -500),
    ];

    const forward = projectDailyBalances([account()], flows, MARCH);
    const backward = projectDailyBalances([account()], [...flows].reverse(), MARCH);

    expect(backward).toEqual(forward);
  });

  it("returns no day for an empty range", () => {
    const days = projectDailyBalances([account()], [], { from: "2026-03-31", to: "2026-03-01" });

    expect(days).toEqual([]);
  });

  it("a category with past spending and no planned item adds nothing to the future", () => {
    // Groceries were spent every few days before today, and nothing is planned for them.
    const pastSpending = [
      transactionFlow(1, "2026-03-02", -4200),
      transactionFlow(2, "2026-03-05", -3100),
      transactionFlow(3, "2026-03-09", -5600),
    ];

    const flows = [...pastSpending, ...plannedFlows([], TODAY)];
    const days = projectDailyBalances([account()], flows, MARCH);

    const expected = 100000 - 4200 - 3100 - 5600;
    expect(flows).toHaveLength(3);
    for (let date = addDays(TODAY, 1); date <= MARCH.to; date = addDays(date, 1)) {
      expect(balanceOn(days, date)).toBe(expected);
    }
  });
});

describe("firstDayBelowZero", () => {
  function day(date: string, balances: Array<[number, number]>): DailyBalance {
    return { date, balances: new Map(balances) };
  }

  it("finds the first day below zero, and returns null when there is none", () => {
    const days = [
      day("2026-03-01", [[CHECKING, 5000]]),
      day("2026-03-02", [[CHECKING, -100]]),
      day("2026-03-03", [[CHECKING, -900]]),
    ];

    expect(firstDayBelowZero(days, [CHECKING])).toBe("2026-03-02");
    expect(firstDayBelowZero(days.slice(0, 1), [CHECKING])).toBeNull();
    expect(firstDayBelowZero([], [CHECKING])).toBeNull();
  });

  it("treats exactly zero as not below zero", () => {
    const days = [day("2026-03-01", [[CHECKING, 0]]), day("2026-03-02", [[CHECKING, 0]])];

    expect(firstDayBelowZero(days, [CHECKING])).toBeNull();
  });

  it("ignores accounts that were not requested", () => {
    const days = [day("2026-03-01", [[CHECKING, 5000], [SAVINGS, -9000]])];

    expect(firstDayBelowZero(days, [CHECKING])).toBeNull();
    expect(firstDayBelowZero(days, [SAVINGS])).toBe("2026-03-01");
  });

  it("sums the requested accounts present that day", () => {
    const days = [
      day("2026-03-01", [[CHECKING, -2000], [SAVINGS, 3000]]),
      day("2026-03-02", [[CHECKING, -4000], [SAVINGS, 3000]]),
    ];

    expect(firstDayBelowZero(days, [CHECKING, SAVINGS])).toBe("2026-03-02");
  });

  it("skips a requested account that is not open yet", () => {
    const days = [day("2026-03-01", [[CHECKING, 1000]]), day("2026-03-02", [[CHECKING, 1000], [SAVINGS, -500]])];

    expect(firstDayBelowZero(days, [CHECKING, SAVINGS])).toBeNull();
  });
});
