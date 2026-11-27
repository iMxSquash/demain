import { describe, expect, it } from "vitest";

import { computedBalancesAt } from "../../src/domain/balance-assertion";
import { addDays } from "../../src/domain/calendar-date";
import type { ResolvedOccurrence } from "../../src/domain/occurrence-resolution";
import {
  firstDayBelowZero,
  lowestPlannedIndex,
  plannedFlows,
  projectDailyBalances,
  projectWithRouting,
  type BalanceAwareSteps,
  type DailyBalance,
  type FlowSource,
  type PlannedItemOccurrences,
  type ProjectionAccount,
  type ProjectionFlow,
  type SimulatedTransfer,
} from "../../src/domain/projection";
import type { DateRange } from "../../src/domain/recurrence";

const TODAY = "2026-03-10";
const CHECKING = 1;
const SAVINGS = 2;
const LIVRET_A = 3;
const LIVRET_JEUNE = 4;
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
  return {
    id: CHECKING,
    currency: "EUR",
    openingDate: "2026-01-01",
    openingBalance: 100000,
    ceiling: null,
    overflowAccountId: null,
    archived: false,
    ...overrides,
  };
}

function transactionFlow(
  transactionId: number,
  date: string,
  amount: number,
  accountId = CHECKING,
): ProjectionFlow {
  return { accountId, date, amount, source: { kind: "transaction", transactionId } };
}

function occurrenceFlow(
  date: string,
  amount: number,
  nominalDate = date,
  accountId = CHECKING,
): ProjectionFlow {
  return {
    accountId,
    date,
    amount,
    source: { kind: "occurrence", plannedItemId: RENT_ITEM, nominalDate },
  };
}

function balanceOn(
  days: readonly DailyBalance[],
  date: string,
  accountId = CHECKING,
): number | undefined {
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
    const flows = plannedFlows(
      [item([occurrence({ nominalDate: "2026-03-05", date: "2026-03-06" })])],
      TODAY,
    );

    expect(flows).toHaveLength(1);
    expect(flows[0]?.date).toBe(TODAY);
    expect(flows[0]?.source).toEqual({
      kind: "occurrence",
      plannedItemId: RENT_ITEM,
      nominalDate: "2026-03-05",
    });
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
    const transfer = item(
      [occurrence({ amount: -20000, expectedAmount: -20000, remaining: -20000 })],
      {
        plannedItemId: TRANSFER_ITEM,
        kind: "transfer",
        accountId: CHECKING,
        destinationAccountId: SAVINGS,
      },
    );

    const flows = plannedFlows([transfer], TODAY);

    const source = { kind: "occurrence", plannedItemId: TRANSFER_ITEM, nominalDate: "2026-03-15" };
    expect(flows).toHaveLength(2);
    expect(flows).toContainEqual({
      accountId: CHECKING,
      date: "2026-03-15",
      amount: -20000,
      source,
    });
    expect(flows).toContainEqual({ accountId: SAVINGS, date: "2026-03-15", amount: 20000, source });
  });

  it("refuses a planned transfer without a destination account", () => {
    const transfer = item([occurrence({ remaining: -20000 })], {
      plannedItemId: TRANSFER_ITEM,
      kind: "transfer",
      destinationAccountId: null,
    });

    expect(() => plannedFlows([transfer], TODAY)).toThrow(
      `Planned transfer ${TRANSFER_ITEM} has no destination account`,
    );
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
      links: [
        { transactionId: 7, occurrenceDate: "2026-03-15", date: "2026-03-08", amount: -45000 },
      ],
      linkedSum: -45000,
    });
    const flows = [
      transactionFlow(7, "2026-03-08", -45000),
      ...plannedFlows([item([settled])], TODAY),
    ];

    const days = projectDailyBalances([account()], flows, MARCH);

    expect(flows).toHaveLength(1);
    expect(balanceOn(days, "2026-03-08")).toBe(55000);
    expect(balanceOn(days, "2026-03-15")).toBe(55000);
    expect(balanceOn(days, "2026-03-31")).toBe(55000);
  });

  it("overdue and cancelled occurrences count for nothing", () => {
    const overdue = occurrence({
      nominalDate: "2026-02-05",
      date: "2026-02-05",
      status: "overdue",
    });
    const cancelled = occurrence({
      nominalDate: "2026-03-20",
      date: "2026-03-20",
      status: "cancelled",
      isCancelled: true,
    });

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
    const flows = [
      transactionFlow(5, "2026-03-04", -12000),
      ...plannedFlows([item([provision])], TODAY),
    ];

    const days = projectDailyBalances([account()], flows, MARCH);

    expect(balanceOn(days, "2026-03-24")).toBe(88000);
    expect(balanceOn(days, "2026-03-25")).toBe(70000);
  });

  it("a planned transfer moves the amount from one account to the other", () => {
    const transfer = item(
      [occurrence({ amount: -20000, expectedAmount: -20000, remaining: -20000 })],
      {
        plannedItemId: TRANSFER_ITEM,
        kind: "transfer",
        accountId: CHECKING,
        destinationAccountId: SAVINGS,
      },
    );
    const accounts = [account(), account({ id: SAVINGS, openingBalance: 5000 })];

    const days = projectDailyBalances(accounts, plannedFlows([transfer], TODAY), MARCH);

    expect(balanceOn(days, "2026-03-14", CHECKING)).toBe(100000);
    expect(balanceOn(days, "2026-03-14", SAVINGS)).toBe(5000);
    expect(balanceOn(days, "2026-03-15", CHECKING)).toBe(80000);
    expect(balanceOn(days, "2026-03-15", SAVINGS)).toBe(25000);
    const total = days.map(
      (day) => (day.balances.get(CHECKING) ?? 0) + (day.balances.get(SAVINGS) ?? 0),
    );
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
    const accounts = [
      account(),
      account({ id: SAVINGS, openingDate: "2026-03-10", openingBalance: 7000 }),
    ];

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

    expect(
      days.every((day) => day.balances.size === 1 && day.balances.get(CHECKING) === 100000),
    ).toBe(true);
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
    const days = [
      day("2026-03-01", [
        [CHECKING, 5000],
        [SAVINGS, -9000],
      ]),
    ];

    expect(firstDayBelowZero(days, [CHECKING])).toBeNull();
    expect(firstDayBelowZero(days, [SAVINGS])).toBe("2026-03-01");
  });

  it("sums the requested accounts present that day", () => {
    const days = [
      day("2026-03-01", [
        [CHECKING, -2000],
        [SAVINGS, 3000],
      ]),
      day("2026-03-02", [
        [CHECKING, -4000],
        [SAVINGS, 3000],
      ]),
    ];

    expect(firstDayBelowZero(days, [CHECKING, SAVINGS])).toBe("2026-03-02");
  });

  it("skips a requested account that is not open yet", () => {
    const days = [
      day("2026-03-01", [[CHECKING, 1000]]),
      day("2026-03-02", [
        [CHECKING, 1000],
        [SAVINGS, -500],
      ]),
    ];

    expect(firstDayBelowZero(days, [CHECKING, SAVINGS])).toBeNull();
  });
});

describe("projectWithRouting", () => {
  const SATURDAY = "2026-03-15";

  // A planned transfer is stored with a negative amount: it leaves its source account.
  function transferItem(
    plannedItemId: number,
    amount: number,
    destinationAccountId: number,
    occurrenceOverrides: Partial<ResolvedOccurrence> = {},
  ): PlannedItemOccurrences {
    return item(
      [
        occurrence({
          amount: -amount,
          expectedAmount: -amount,
          remaining: -amount,
          ...occurrenceOverrides,
        }),
      ],
      { plannedItemId, kind: "transfer", accountId: CHECKING, destinationAccountId },
    );
  }

  function livretJeune(overrides: Partial<ProjectionAccount> = {}): ProjectionAccount {
    return account({
      id: LIVRET_JEUNE,
      openingBalance: 155000,
      ceiling: 160000,
      overflowAccountId: LIVRET_A,
      ...overrides,
    });
  }

  function livretA(overrides: Partial<ProjectionAccount> = {}): ProjectionAccount {
    return account({ id: LIVRET_A, openingBalance: 0, ...overrides });
  }

  function placementsOf(
    result: { transfers: ReturnType<typeof projectWithRouting>["transfers"] },
    index = 0,
  ) {
    const routing = result.transfers[index]?.routing;
    return routing?.status === "ok" ? routing.placements : undefined;
  }

  it("splits a transfer between a nearly full account and its overflow account (DOMAIN example 1)", () => {
    const accounts = [account(), livretJeune(), livretA()];

    const result = projectWithRouting(
      accounts,
      [],
      [transferItem(TRANSFER_ITEM, 20000, LIVRET_JEUNE)],
      TODAY,
      MARCH,
    );

    expect(result.transfers).toHaveLength(1);
    expect(result.transfers[0]?.routing).toEqual({
      status: "ok",
      placements: [
        { accountId: LIVRET_JEUNE, amount: 5000 },
        { accountId: LIVRET_A, amount: 15000 },
      ],
      unplaced: 0,
      stoppedAt: LIVRET_A,
    });
    expect(balanceOn(result.days, "2026-03-14", CHECKING)).toBe(100000);
    expect(balanceOn(result.days, MARCH.to, CHECKING)).toBe(100000 - 20000);
    expect(balanceOn(result.days, MARCH.to, LIVRET_JEUNE)).toBe(160000);
    expect(balanceOn(result.days, MARCH.to, LIVRET_A)).toBe(15000);
  });

  it("leaves the surplus on the source when the chain is full (DOMAIN example 2)", () => {
    const accounts = [
      account(),
      livretJeune(),
      livretA({ openingBalance: 2290000, ceiling: 2295000 }),
    ];

    const result = projectWithRouting(
      accounts,
      [],
      [transferItem(TRANSFER_ITEM, 20000, LIVRET_JEUNE)],
      TODAY,
      MARCH,
    );

    expect(result.transfers).toHaveLength(1);
    expect(result.transfers[0]).toMatchObject({
      plannedItemId: TRANSFER_ITEM,
      nominalDate: SATURDAY,
      date: SATURDAY,
      amount: 20000,
    });
    expect(result.transfers[0]?.routing).toEqual({
      status: "ok",
      placements: [
        { accountId: LIVRET_JEUNE, amount: 5000 },
        { accountId: LIVRET_A, amount: 5000 },
      ],
      unplaced: 10000,
      stoppedAt: LIVRET_A,
    });
    expect(balanceOn(result.days, MARCH.to, CHECKING)).toBe(100000 - 10000);
    expect(balanceOn(result.days, MARCH.to, LIVRET_JEUNE)).toBe(160000);
    expect(balanceOn(result.days, MARCH.to, LIVRET_A)).toBe(2295000);
  });

  it("without any ceiling gives the same days as projectDailyBalances", () => {
    const accounts = [account(), livretA({ openingBalance: 5000 })];
    const real = [
      transactionFlow(1, "2026-03-03", -1200),
      transactionFlow(2, "2026-03-20", 2500, LIVRET_A),
    ];
    const items = [
      item([occurrence()]),
      transferItem(TRANSFER_ITEM, 20000, LIVRET_A, {
        nominalDate: "2026-03-18",
        date: "2026-03-18",
      }),
    ];

    const result = projectWithRouting(accounts, real, items, TODAY, MARCH);

    expect(result.days).toEqual(
      projectDailyBalances(accounts, real.concat(plannedFlows(items, TODAY)), MARCH),
    );
    expect(result.transfers).toHaveLength(1);
    expect(placementsOf(result)).toEqual([{ accountId: LIVRET_A, amount: 20000 }]);
  });

  it("records nothing for a transfer with nothing remaining", () => {
    const accounts = [account(), livretJeune(), livretA()];

    const result = projectWithRouting(
      accounts,
      [],
      [transferItem(TRANSFER_ITEM, 0, LIVRET_JEUNE)],
      TODAY,
      MARCH,
    );

    expect(result.transfers).toEqual([]);
    expect(result.days).toEqual(projectDailyBalances(accounts, [], MARCH));
  });

  it("sends the next transfer entirely to the overflow account once the ceiling is reached exactly", () => {
    const accounts = [account(), livretJeune({ openingBalance: 150000 }), livretA()];
    const items = [
      transferItem(TRANSFER_ITEM, 10000, LIVRET_JEUNE),
      transferItem(TRANSFER_ITEM + 1, 3000, LIVRET_JEUNE),
    ];

    const result = projectWithRouting(accounts, [], items, TODAY, MARCH);

    expect(result.transfers.map((transfer) => transfer.plannedItemId)).toEqual([
      TRANSFER_ITEM,
      TRANSFER_ITEM + 1,
    ]);
    expect(result.transfers[0]?.routing).toMatchObject({
      status: "ok",
      placements: [{ accountId: LIVRET_JEUNE, amount: 10000 }],
      unplaced: 0,
    });
    expect(result.transfers[1]?.routing).toMatchObject({
      status: "ok",
      placements: [{ accountId: LIVRET_A, amount: 3000 }],
      unplaced: 0,
    });
    expect(balanceOn(result.days, MARCH.to, LIVRET_JEUNE)).toBe(160000);
    expect(balanceOn(result.days, MARCH.to, LIVRET_A)).toBe(3000);
  });

  it("places nothing and keeps the source untouched when the destination is full and has no overflow account", () => {
    const accounts = [account(), livretJeune({ openingBalance: 160000, overflowAccountId: null })];

    const result = projectWithRouting(
      accounts,
      [],
      [transferItem(TRANSFER_ITEM, 5000, LIVRET_JEUNE)],
      TODAY,
      MARCH,
    );

    expect(result.transfers).toHaveLength(1);
    expect(result.transfers[0]?.routing).toEqual({
      status: "ok",
      placements: [],
      unplaced: 5000,
      stoppedAt: LIVRET_JEUNE,
    });
    expect(balanceOn(result.days, MARCH.to, CHECKING)).toBe(100000);
    expect(balanceOn(result.days, MARCH.to, LIVRET_JEUNE)).toBe(160000);
  });

  it("reports a cycle in the chain and moves nothing", () => {
    const accounts = [
      account(),
      livretJeune({ openingBalance: 0, overflowAccountId: LIVRET_A }),
      livretA({ ceiling: 1000, overflowAccountId: LIVRET_JEUNE }),
    ];

    const result = projectWithRouting(
      accounts,
      [],
      [transferItem(TRANSFER_ITEM, 5000, LIVRET_JEUNE)],
      TODAY,
      MARCH,
    );

    expect(result.transfers).toHaveLength(1);
    expect(result.transfers[0]?.routing).toEqual({ status: "invalid", reason: "cycle" });
    expect(result.days).toEqual(projectDailyBalances(accounts, [], MARCH));
  });

  it("reports a currency mismatch along the chain and moves nothing", () => {
    const accounts = [account(), livretJeune(), livretA({ currency: "USD" })];

    const result = projectWithRouting(
      accounts,
      [],
      [transferItem(TRANSFER_ITEM, 20000, LIVRET_JEUNE)],
      TODAY,
      MARCH,
    );

    expect(result.transfers[0]?.routing).toEqual({ status: "invalid", reason: "currency" });
    expect(result.days).toEqual(projectDailyBalances(accounts, [], MARCH));
  });

  it("reports an archived overflow account and moves nothing", () => {
    const accounts = [account(), livretJeune(), livretA({ archived: true })];

    const result = projectWithRouting(
      accounts,
      [],
      [transferItem(TRANSFER_ITEM, 20000, LIVRET_JEUNE)],
      TODAY,
      MARCH,
    );

    expect(result.transfers[0]?.routing).toEqual({ status: "invalid", reason: "archived" });
    expect(result.days).toEqual(projectDailyBalances(accounts, [], MARCH));
  });

  it("throws a RangeError for a non-integer remaining amount", () => {
    const accounts = [account(), livretA()];
    const transfer = transferItem(TRANSFER_ITEM, 100, LIVRET_A, { remaining: 100.5 });

    expect(() => projectWithRouting(accounts, [], [transfer], TODAY, MARCH)).toThrow(RangeError);
  });

  it("throws a RangeError for a non-integer remaining amount even when the chain is invalid", () => {
    const accounts = [
      account(),
      livretJeune({ openingBalance: 0, overflowAccountId: LIVRET_A }),
      livretA({ ceiling: 1000, overflowAccountId: LIVRET_JEUNE }),
    ];
    const transfer = transferItem(TRANSFER_ITEM, 100, LIVRET_JEUNE, { remaining: 100.5 });

    expect(() => projectWithRouting(accounts, [], [transfer], TODAY, MARCH)).toThrow(RangeError);
  });

  it("throws a RangeError for a non-integer remaining amount when the destination is unknown", () => {
    const accounts = [account()];
    const transfer = transferItem(TRANSFER_ITEM, 100, 99, { remaining: 100.5 });

    expect(() => projectWithRouting(accounts, [], [transfer], TODAY, MARCH)).toThrow(RangeError);
  });

  it("keeps the whole transfer on the destination when it has room and no overflow account", () => {
    const accounts = [account(), livretA({ ceiling: 100000 })];

    const result = projectWithRouting(
      accounts,
      [],
      [transferItem(TRANSFER_ITEM, 20000, LIVRET_A)],
      TODAY,
      MARCH,
    );

    expect(result.transfers[0]?.routing).toEqual({
      status: "ok",
      placements: [{ accountId: LIVRET_A, amount: 20000 }],
      unplaced: 0,
      stoppedAt: LIVRET_A,
    });
  });

  it("applies a real deposit of the same day before a planned transfer", () => {
    const accounts = [account(), livretJeune(), livretA()];
    const real = [transactionFlow(1, SATURDAY, 3000, LIVRET_JEUNE)];

    const result = projectWithRouting(
      accounts,
      real,
      [transferItem(TRANSFER_ITEM, 5000, LIVRET_JEUNE)],
      TODAY,
      MARCH,
    );

    expect(placementsOf(result)).toEqual([
      { accountId: LIVRET_JEUNE, amount: 2000 },
      { accountId: LIVRET_A, amount: 3000 },
    ]);
  });

  it("routes two transfers of the same day by planned item id, whatever the input order", () => {
    const accounts = [account(), livretJeune({ openingBalance: 154000 }), livretA()];
    const items = [
      transferItem(TRANSFER_ITEM + 10, 5000, LIVRET_JEUNE),
      transferItem(TRANSFER_ITEM, 5000, LIVRET_JEUNE),
    ];

    const result = projectWithRouting(accounts, [], items, TODAY, MARCH);

    expect(result.transfers.map((transfer) => transfer.plannedItemId)).toEqual([
      TRANSFER_ITEM,
      TRANSFER_ITEM + 10,
    ]);
    expect(placementsOf(result, 0)).toEqual([{ accountId: LIVRET_JEUNE, amount: 5000 }]);
    expect(placementsOf(result, 1)).toEqual([
      { accountId: LIVRET_JEUNE, amount: 1000 },
      { accountId: LIVRET_A, amount: 4000 },
    ]);
  });

  it("routes two occurrences of the same item and day by nominal date", () => {
    const accounts = [account(), livretJeune({ openingBalance: 154000 }), livretA()];
    const later = occurrence({
      nominalDate: "2026-03-12",
      date: SATURDAY,
      amount: -5000,
      expectedAmount: -5000,
      remaining: -5000,
    });
    const earlier = occurrence({
      nominalDate: "2026-03-10",
      date: SATURDAY,
      amount: -5000,
      expectedAmount: -5000,
      remaining: -5000,
    });
    const transfer = item([later, earlier], {
      plannedItemId: TRANSFER_ITEM,
      kind: "transfer",
      accountId: CHECKING,
      destinationAccountId: LIVRET_JEUNE,
    });

    const result = projectWithRouting(accounts, [], [transfer], TODAY, MARCH);

    expect(result.transfers.map((record) => record.nominalDate)).toEqual([
      "2026-03-10",
      "2026-03-12",
    ]);
    expect(placementsOf(result, 0)).toEqual([{ accountId: LIVRET_JEUNE, amount: 5000 }]);
    expect(placementsOf(result, 1)).toEqual([
      { accountId: LIVRET_JEUNE, amount: 1000 },
      { accountId: LIVRET_A, amount: 4000 },
    ]);
  });

  it("lets a planned expense of a lower id free room before the transfer of the same day", () => {
    const accounts = [account(), livretJeune({ openingBalance: 160000 }), livretA()];
    const expense = item([occurrence({ amount: -4000, expectedAmount: -4000, remaining: -4000 })], {
      plannedItemId: TRANSFER_ITEM - 15,
      kind: "expense",
      accountId: LIVRET_JEUNE,
    });

    const result = projectWithRouting(
      accounts,
      [],
      [transferItem(TRANSFER_ITEM, 5000, LIVRET_JEUNE), expense],
      TODAY,
      MARCH,
    );

    expect(result.transfers).toHaveLength(1);
    expect(placementsOf(result)).toEqual([
      { accountId: LIVRET_JEUNE, amount: 4000 },
      { accountId: LIVRET_A, amount: 1000 },
    ]);
    expect(balanceOn(result.days, MARCH.to, LIVRET_JEUNE)).toBe(160000);
  });

  it("lets a planned income of a lower id use up room before the transfer of the same day", () => {
    const accounts = [account(), livretJeune(), livretA()];
    const income = item([occurrence({ amount: 3000, expectedAmount: 3000, remaining: 3000 })], {
      plannedItemId: TRANSFER_ITEM - 15,
      kind: "income",
      accountId: LIVRET_JEUNE,
    });

    const result = projectWithRouting(
      accounts,
      [],
      [transferItem(TRANSFER_ITEM, 5000, LIVRET_JEUNE), income],
      TODAY,
      MARCH,
    );

    expect(result.transfers).toHaveLength(1);
    expect(placementsOf(result)).toEqual([
      { accountId: LIVRET_JEUNE, amount: 2000 },
      { accountId: LIVRET_A, amount: 3000 },
    ]);
    expect(balanceOn(result.days, MARCH.to, LIVRET_JEUNE)).toBe(160000);
  });

  it("orders by real date, not by the bucket of a range that starts later", () => {
    const range: DateRange = { from: "2026-03-25", to: "2026-03-31" };
    const accounts = [account(), livretJeune({ openingBalance: 150000 }), livretA()];
    // Dated after the transfer but before range.from: it must not eat the room of the transfer.
    const real = [transactionFlow(1, "2026-03-20", 8000, LIVRET_JEUNE)];

    const result = projectWithRouting(
      accounts,
      real,
      [transferItem(TRANSFER_ITEM, 5000, LIVRET_JEUNE)],
      TODAY,
      range,
    );

    expect(placementsOf(result)).toEqual([{ accountId: LIVRET_JEUNE, amount: 5000 }]);
    expect(balanceOn(result.days, "2026-03-25", LIVRET_JEUNE)).toBe(163000);
    expect(balanceOn(result.days, "2026-03-25", LIVRET_A)).toBe(0);
    expect(balanceOn(result.days, "2026-03-25", CHECKING)).toBe(95000);
  });

  it("routes an open occurrence past its date at today, with the balance of that day", () => {
    const accounts = [account(), livretJeune({ openingBalance: 150000 }), livretA()];
    const real = [
      transactionFlow(1, "2026-03-08", 1000, LIVRET_JEUNE),
      transactionFlow(2, TODAY, 7000, LIVRET_JEUNE),
      transactionFlow(3, "2026-03-12", 50000, LIVRET_JEUNE),
    ];
    const late = transferItem(TRANSFER_ITEM, 5000, LIVRET_JEUNE, {
      nominalDate: "2026-03-05",
      date: "2026-03-06",
    });

    const result = projectWithRouting(accounts, real, [late], TODAY, MARCH);

    expect(result.transfers[0]).toMatchObject({ nominalDate: "2026-03-05", date: TODAY });
    expect(placementsOf(result)).toEqual([
      { accountId: LIVRET_JEUNE, amount: 2000 },
      { accountId: LIVRET_A, amount: 3000 },
    ]);
  });

  it("does not route confirmed, overdue or cancelled occurrences", () => {
    const accounts = [account(), livretJeune(), livretA()];
    const occurrences = [
      occurrence({
        nominalDate: "2026-03-12",
        date: "2026-03-12",
        remaining: -20000,
        status: "confirmed",
      }),
      occurrence({
        nominalDate: "2026-02-05",
        date: "2026-02-05",
        remaining: -20000,
        status: "overdue",
      }),
      occurrence({
        nominalDate: "2026-03-20",
        date: "2026-03-20",
        remaining: -20000,
        status: "cancelled",
        isCancelled: true,
      }),
    ];
    const transfer = item(occurrences, {
      plannedItemId: TRANSFER_ITEM,
      kind: "transfer",
      accountId: CHECKING,
      destinationAccountId: LIVRET_JEUNE,
    });

    const result = projectWithRouting(accounts, [], [transfer], TODAY, MARCH);

    expect(result.transfers).toEqual([]);
    expect(result.days).toEqual(projectDailyBalances(accounts, [], MARCH));
  });

  it("debits the source in full and records nothing when the destination is unknown", () => {
    const accounts = [account()];

    const result = projectWithRouting(
      accounts,
      [],
      [transferItem(TRANSFER_ITEM, 20000, 99)],
      TODAY,
      MARCH,
    );

    expect(result.transfers).toEqual([]);
    expect(balanceOn(result.days, "2026-03-14")).toBe(100000);
    expect(balanceOn(result.days, SATURDAY)).toBe(80000);
  });

  it("routes a transfer stored with a negative remaining by its absolute amount", () => {
    const accounts = [account(), livretA()];
    const transfer = transferItem(TRANSFER_ITEM, 20000, LIVRET_A);

    const result = projectWithRouting(accounts, [], [transfer], TODAY, MARCH);

    expect(result.transfers[0]?.amount).toBe(20000);
    expect(placementsOf(result)).toEqual([{ accountId: LIVRET_A, amount: 20000 }]);
    expect(balanceOn(result.days, SATURDAY, LIVRET_A)).toBe(20000);
  });

  describe("with a transfer between two real flows on the destination", () => {
    const accounts = [account(), livretJeune({ openingBalance: 150000 }), livretA()];
    const real = [
      transactionFlow(1, "2026-03-05", 3000, LIVRET_JEUNE),
      transactionFlow(2, "2026-03-20", -1000, LIVRET_JEUNE),
    ];
    const run = () =>
      projectWithRouting(
        accounts,
        real,
        [transferItem(TRANSFER_ITEM, 10000, LIVRET_JEUNE)],
        TODAY,
        MARCH,
      );

    it("routes the transfer from the running balance of its day", () => {
      expect(placementsOf(run())).toEqual([
        { accountId: LIVRET_JEUNE, amount: 7000 },
        { accountId: LIVRET_A, amount: 3000 },
      ]);
    });

    it("leaves the balances untouched by the transfer before its day", () => {
      const { days } = run();

      expect(balanceOn(days, "2026-03-14", LIVRET_JEUNE)).toBe(153000);
      expect(balanceOn(days, "2026-03-14", LIVRET_A)).toBe(0);
      expect(balanceOn(days, "2026-03-14", CHECKING)).toBe(100000);
    });

    it("applies the transfer on its day", () => {
      const { days } = run();

      expect(balanceOn(days, SATURDAY, LIVRET_JEUNE)).toBe(160000);
      expect(balanceOn(days, SATURDAY, LIVRET_A)).toBe(3000);
      expect(balanceOn(days, SATURDAY, CHECKING)).toBe(90000);
    });

    it("keeps the balances cumulative over the days after the transfer", () => {
      const { days } = run();

      expect(balanceOn(days, "2026-03-20", LIVRET_JEUNE)).toBe(159000);
      expect(balanceOn(days, MARCH.to, LIVRET_A)).toBe(3000);
      expect(balanceOn(days, MARCH.to, CHECKING)).toBe(90000);
    });
  });

  describe("with a simulation", () => {
    const SIM_TODAY = "2026-12-10";
    const DECEMBER: DateRange = { from: "2026-12-01", to: "2026-12-31" };
    const TRANSFER_DAY = "2026-12-15";
    const MODIFICATION: FlowSource = { kind: "modification", modificationId: 1 };

    function decemberOccurrence(amount: number): Partial<ResolvedOccurrence> {
      return {
        nominalDate: TRANSFER_DAY,
        date: TRANSFER_DAY,
        amount,
        expectedAmount: amount,
        remaining: amount,
      };
    }

    function simulatedTransfer(amount: number, destinationAccountId: number): SimulatedTransfer {
      return {
        sourceAccountId: CHECKING,
        destinationAccountId,
        amount,
        date: TRANSFER_DAY,
        source: MODIFICATION,
      };
    }

    function transfersOnDay(
      transfers: readonly SimulatedTransfer[],
    ): BalanceAwareSteps["transfersOn"] {
      return (date) => (date === TRANSFER_DAY ? transfers : []);
    }

    const noCredits: BalanceAwareSteps["creditsOn"] = () => [];

    it("projectWithRouting without steps gives the same days and routings as before", () => {
      const accounts = [account(), livretJeune(), livretA()];
      const real = [
        transactionFlow(1, "2026-11-20", -2000),
        transactionFlow(2, "2026-12-03", 3000, LIVRET_JEUNE),
      ];
      const items = [
        item([occurrence(decemberOccurrence(-45000))]),
        transferItem(TRANSFER_ITEM, 10000, LIVRET_JEUNE, decemberOccurrence(-10000)),
      ];

      const before = projectWithRouting(accounts, real, items, SIM_TODAY, DECEMBER);
      const empty = projectWithRouting(accounts, real, items, SIM_TODAY, DECEMBER, {
        simulatedFlows: [],
        steps: { transfersOn: () => [], creditsOn: noCredits },
      });

      expect(placementsOf(before)).toEqual([
        { accountId: LIVRET_JEUNE, amount: 2000 },
        { accountId: LIVRET_A, amount: 8000 },
      ]);
      expect(before.simulatedTransfers).toEqual([]);
      expect(empty).toEqual(before);
    });

    it("a simulated transfer is routed along the overflow chain like a planned transfer", () => {
      const accounts = [account(), livretJeune(), livretA()];

      const result = projectWithRouting(accounts, [], [], SIM_TODAY, DECEMBER, {
        steps: {
          transfersOn: transfersOnDay([simulatedTransfer(20000, LIVRET_JEUNE)]),
          creditsOn: noCredits,
        },
      });

      expect(result.simulatedTransfers).toEqual([
        {
          source: MODIFICATION,
          date: TRANSFER_DAY,
          amount: 20000,
          routing: {
            status: "ok",
            placements: [
              { accountId: LIVRET_JEUNE, amount: 5000 },
              { accountId: LIVRET_A, amount: 15000 },
            ],
            unplaced: 0,
            stoppedAt: LIVRET_A,
          },
        },
      ]);
      expect(result.transfers).toEqual([]);
      expect(balanceOn(result.days, TRANSFER_DAY, LIVRET_JEUNE)).toBe(160000);
      expect(balanceOn(result.days, TRANSFER_DAY, LIVRET_A)).toBe(15000);
      expect(balanceOn(result.days, TRANSFER_DAY, CHECKING)).toBe(80000);
      expect(balanceOn(result.days, "2026-12-14", CHECKING)).toBe(100000);
    });

    it("transfersOn sees the balances after the ordinary flows of the day", () => {
      const seen: [string, number | undefined][] = [];
      const real = [
        transactionFlow(1, "2026-11-20", -2000),
        transactionFlow(2, "2026-12-12", 3000),
      ];
      const rent = item([occurrence(decemberOccurrence(-45000))]);
      const simulated: ProjectionFlow = {
        accountId: CHECKING,
        date: TRANSFER_DAY,
        amount: -1000,
        source: MODIFICATION,
      };

      projectWithRouting([account()], real, [rent], SIM_TODAY, DECEMBER, {
        simulatedFlows: [simulated],
        steps: {
          transfersOn: (date, balances) => {
            seen.push([date, balances.get(CHECKING)]);
            return [];
          },
          creditsOn: noCredits,
        },
      });

      expect(seen).toHaveLength(31);
      expect(seen[0]).toEqual(["2026-12-01", 98000]);
      expect(seen.find(([date]) => date === "2026-12-12")).toEqual(["2026-12-12", 101000]);
      expect(seen.find(([date]) => date === TRANSFER_DAY)).toEqual([TRANSFER_DAY, 55000]);
      expect(seen.map(([date]) => date)).toEqual(
        Array.from({ length: 31 }, (_, index) => addDays(DECEMBER.from, index)),
      );
    });

    it("creditsOn sees the balances after the transfers of the day and its flows apply last", () => {
      const accounts = [account(), livretJeune(), livretA()];
      const seen: number[] = [];
      const interest: ProjectionFlow = {
        accountId: LIVRET_JEUNE,
        date: TRANSFER_DAY,
        amount: 100,
        source: MODIFICATION,
      };

      const result = projectWithRouting(accounts, [], [], SIM_TODAY, DECEMBER, {
        steps: {
          transfersOn: transfersOnDay([simulatedTransfer(20000, LIVRET_JEUNE)]),
          creditsOn: (date, balances) => {
            if (date !== TRANSFER_DAY) return [];
            seen.push(balances.get(LIVRET_JEUNE) ?? 0);
            return [interest];
          },
        },
      });

      expect(seen).toEqual([160000]);
      // Interest is credited, not routed: it may leave the balance above the ceiling.
      expect(balanceOn(result.days, TRANSFER_DAY, LIVRET_JEUNE)).toBe(160100);
      expect(balanceOn(result.days, TRANSFER_DAY, LIVRET_A)).toBe(15000);
      expect(balanceOn(result.days, DECEMBER.to, LIVRET_JEUNE)).toBe(160100);
    });

    it("a cycle in stored data makes a simulated transfer invalid and it places nothing", () => {
      const accounts = [
        account(),
        livretJeune({ openingBalance: 0, overflowAccountId: LIVRET_A }),
        livretA({ ceiling: 1000, overflowAccountId: LIVRET_JEUNE }),
      ];

      const result = projectWithRouting(accounts, [], [], SIM_TODAY, DECEMBER, {
        steps: {
          transfersOn: transfersOnDay([simulatedTransfer(5000, LIVRET_JEUNE)]),
          creditsOn: noCredits,
        },
      });

      expect(result.simulatedTransfers).toHaveLength(1);
      expect(result.simulatedTransfers[0]?.routing).toEqual({ status: "invalid", reason: "cycle" });
      expect(result.days).toEqual(projectDailyBalances(accounts, [], DECEMBER));
    });

    it("simulated flows passed in simulatedFlows apply after the planned occurrences of their day, real flows before", () => {
      const accounts = [account(), livretJeune(), livretA()];
      const simulatedWithdrawal: ProjectionFlow = {
        accountId: LIVRET_JEUNE,
        date: TRANSFER_DAY,
        amount: -5000,
        source: MODIFICATION,
      };
      const realWithdrawal = transactionFlow(1, TRANSFER_DAY, -3000, LIVRET_JEUNE);
      const transfer = transferItem(TRANSFER_ITEM, 10000, LIVRET_JEUNE, decemberOccurrence(-10000));

      const result = projectWithRouting(
        accounts,
        [realWithdrawal],
        [transfer],
        SIM_TODAY,
        DECEMBER,
        {
          simulatedFlows: [simulatedWithdrawal],
        },
      );

      // The real withdrawal frees 3000 of room before the transfer; the simulated one frees nothing.
      expect(placementsOf(result)).toEqual([
        { accountId: LIVRET_JEUNE, amount: 8000 },
        { accountId: LIVRET_A, amount: 2000 },
      ]);
      expect(balanceOn(result.days, TRANSFER_DAY, LIVRET_JEUNE)).toBe(155000);
      expect(result.simulatedTransfers).toEqual([]);
    });

    it.each([0, -1000, 100.5])("refuses a simulated transfer of %s", (amount) => {
      const steps: BalanceAwareSteps = {
        transfersOn: transfersOnDay([simulatedTransfer(amount, LIVRET_A)]),
        creditsOn: noCredits,
      };

      expect(() =>
        projectWithRouting([account(), livretA()], [], [], SIM_TODAY, DECEMBER, { steps }),
      ).toThrow(RangeError);
    });

    it("refuses a step movement dated another day than the one asked", () => {
      const lateTransfer = { ...simulatedTransfer(1000, LIVRET_A), date: "2026-12-16" };
      const lateCredit: ProjectionFlow = {
        ...transactionFlow(1, "2026-12-16", 100),
        source: MODIFICATION,
      };
      const run = (steps: BalanceAwareSteps) => () =>
        projectWithRouting([account(), livretA()], [], [], SIM_TODAY, DECEMBER, { steps });

      expect(run({ transfersOn: transfersOnDay([lateTransfer]), creditsOn: noCredits })).toThrow(
        RangeError,
      );
      expect(
        run({
          transfersOn: () => [],
          creditsOn: (date) => (date === TRANSFER_DAY ? [lateCredit] : []),
        }),
      ).toThrow(RangeError);
    });

    it("debits the source in full and records nothing for a simulated transfer out of the accounts", () => {
      const result = projectWithRouting([account()], [], [], SIM_TODAY, DECEMBER, {
        steps: { transfersOn: transfersOnDay([simulatedTransfer(5000, 99)]), creditsOn: noCredits },
      });

      expect(result.simulatedTransfers).toEqual([]);
      expect(balanceOn(result.days, TRANSFER_DAY)).toBe(95000);
    });

    it("calls no step for an empty range", () => {
      let calls = 0;
      const count = () => {
        calls += 1;
        return [];
      };

      projectWithRouting(
        [account()],
        [],
        [],
        SIM_TODAY,
        { from: "2026-12-31", to: "2026-12-01" },
        {
          steps: { transfersOn: count, creditsOn: count },
        },
      );

      expect(calls).toBe(0);
    });

    it("leaves an account out of the balances a step sees before its opening date", () => {
      const seen: boolean[] = [];
      const late = livretA({ openingDate: TRANSFER_DAY });

      projectWithRouting([account(), late], [], [], SIM_TODAY, DECEMBER, {
        steps: {
          transfersOn: (date, balances) => {
            if (date === "2026-12-14" || date === TRANSFER_DAY) seen.push(balances.has(LIVRET_A));
            return [];
          },
          creditsOn: noCredits,
        },
      });

      expect(seen).toEqual([false, true]);
    });
  });
});

describe("lowestPlannedIndex", () => {
  it("ignores the real months and today, even when they are lower", () => {
    expect(lowestPlannedIndex([-500, 10, 300, 200, 400], 1)).toBe(3);
  });

  it("returns the earliest index on a tie", () => {
    expect(lowestPlannedIndex([0, 50, 20, 20, 90], 0)).toBe(2);
  });

  it("returns null when no month is planned", () => {
    expect(lowestPlannedIndex([10, 20, 30], 2)).toBeNull();
    expect(lowestPlannedIndex([], 0)).toBeNull();
  });

  it("handles negative values", () => {
    expect(lowestPlannedIndex([100, -20, -300, -150], 0)).toBe(2);
  });

  it("finds the only planned month", () => {
    expect(lowestPlannedIndex([5, 7], 0)).toBe(1);
  });
});
