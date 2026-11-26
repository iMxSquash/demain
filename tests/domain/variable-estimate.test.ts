import { describe, expect, it } from "vitest";

import { addDays } from "../../src/domain/calendar-date";

import {
  estimatedFlows,
  estimateLines,
  spreadEvenly,
  type EstimateAccount,
  type EstimateLine,
  type EstimateTransaction,
} from "../../src/domain/variable-estimate";

const TODAY = "2026-12-10";
const CHECKING = 1;
const SAVINGS = 2;
const GROCERIES = 10;
const LEISURE = 11;

function account(id: number, overrides: Partial<EstimateAccount> = {}): EstimateAccount {
  return { id, openingDate: "2020-01-01", archived: false, ...overrides };
}

function expense(
  date: string,
  amount: number,
  overrides: Partial<EstimateTransaction> = {},
): EstimateTransaction {
  return {
    accountId: CHECKING,
    categoryId: GROCERIES,
    date,
    amount,
    type: "expense",
    linkedToPlannedItem: false,
    ...overrides,
  };
}

const groceriesThreeMonths = [
  expense("2026-09-05", -30000),
  expense("2026-10-05", -36000),
  expense("2026-11-05", -33000),
];

describe("estimateLines", () => {
  it("averages the last 3 complete months of a line", () => {
    const lines = estimateLines([account(CHECKING)], groceriesThreeMonths, [], 3, TODAY);

    expect(lines).toEqual([
      {
        accountId: CHECKING,
        categoryId: GROCERIES,
        monthlySpending: 33000,
        monthsUsed: 3,
        averageSpending: 33000,
        overridden: false,
      },
    ]);
  });

  it("uses a window of 6 or 12 months", () => {
    const transactions = [
      expense("2025-12-20", -12000),
      expense("2026-06-20", -6000),
      ...groceriesThreeMonths,
    ];

    const [six] = estimateLines([account(CHECKING)], transactions, [], 6, TODAY);
    const [twelve] = estimateLines([account(CHECKING)], transactions, [], 12, TODAY);

    expect(six).toMatchObject({ monthlySpending: 17500, monthsUsed: 6 });
    expect(twelve).toMatchObject({ monthlySpending: 9750, monthsUsed: 12 });
  });

  it("rounds the average to the nearest minor unit, ties away from zero", () => {
    const lines = estimateLines(
      [account(CHECKING, { openingDate: "2026-10-01" })],
      [expense("2026-10-03", -101), expense("2026-11-03", -100)],
      [],
      3,
      TODAY,
    );

    expect(lines[0]).toMatchObject({ monthlySpending: 101, monthsUsed: 2 });
  });

  it("ignores incomes, interest, transfers and transactions linked to a planned item", () => {
    const lines = estimateLines(
      [account(CHECKING)],
      [
        ...groceriesThreeMonths,
        expense("2026-11-01", 200000, { type: "income" }),
        expense("2026-11-02", 500, { type: "interest" }),
        expense("2026-11-03", -40000, { type: "transfer" }),
        expense("2026-11-04", -9000, { linkedToPlannedItem: true }),
        expense("2026-11-06", -1500, { categoryId: LEISURE, type: "transfer" }),
      ],
      [],
      3,
      TODAY,
    );

    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ categoryId: GROCERIES, monthlySpending: 33000 });
  });

  it("keeps uncategorized spending as its own line per account", () => {
    const lines = estimateLines(
      [account(CHECKING), account(SAVINGS)],
      [
        expense("2026-11-08", -3000, { categoryId: null }),
        expense("2026-11-09", -600, { categoryId: null, accountId: SAVINGS }),
        expense("2026-11-10", -900),
      ],
      [],
      3,
      TODAY,
    );

    expect(
      lines.map(({ accountId, categoryId, monthlySpending }) => ({
        accountId,
        categoryId,
        monthlySpending,
      })),
    ).toEqual([
      { accountId: CHECKING, categoryId: GROCERIES, monthlySpending: 300 },
      { accountId: CHECKING, categoryId: null, monthlySpending: 1000 },
      { accountId: SAVINGS, categoryId: null, monthlySpending: 200 },
    ]);
  });

  it("uses only the complete months after the account opened", () => {
    const lines = estimateLines(
      [account(CHECKING, { openingDate: "2026-10-15" })],
      [expense("2026-10-20", -50000), expense("2026-11-05", -33000)],
      [],
      3,
      TODAY,
    );

    expect(lines[0]).toMatchObject({ monthlySpending: 33000, monthsUsed: 1 });
  });

  it("gives no estimate without a complete month", () => {
    const lines = estimateLines(
      [account(CHECKING, { openingDate: "2026-11-15" })],
      [expense("2026-11-20", -8000)],
      [],
      3,
      TODAY,
    );

    expect(lines).toEqual([
      {
        accountId: CHECKING,
        categoryId: GROCERIES,
        monthlySpending: 0,
        monthsUsed: 0,
        averageSpending: 0,
        overridden: false,
      },
    ]);
  });

  it("counts a negative average as zero", () => {
    const lines = estimateLines(
      [account(CHECKING)],
      [expense("2026-11-05", -1000), expense("2026-11-06", 4000)],
      [],
      3,
      TODAY,
    );

    expect(lines[0]).toMatchObject({ monthlySpending: 0, averageSpending: 0 });
  });

  it("ignores transactions outside the window", () => {
    const lines = estimateLines(
      [account(CHECKING)],
      [expense("2026-08-31", -90000), expense("2026-12-02", -7000)],
      [],
      3,
      TODAY,
    );

    expect(lines).toEqual([]);
  });

  it("ignores archived accounts", () => {
    const lines = estimateLines(
      [account(CHECKING, { archived: true }), account(SAVINGS)],
      [
        ...groceriesThreeMonths,
        expense("2026-11-05", -3000, { accountId: SAVINGS }),
        expense("2026-11-05", -3000, { accountId: 99 }),
      ],
      [{ accountId: CHECKING, categoryId: GROCERIES, monthlyAmount: 25000 }],
      3,
      TODAY,
    );

    expect(lines).toEqual([
      {
        accountId: SAVINGS,
        categoryId: GROCERIES,
        monthlySpending: 1000,
        monthsUsed: 3,
        averageSpending: 1000,
        overridden: false,
      },
    ]);
  });

  it("refuses an override below zero", () => {
    expect(() =>
      estimateLines(
        [account(CHECKING)],
        [],
        [{ accountId: CHECKING, categoryId: GROCERIES, monthlyAmount: -25000 }],
        3,
        TODAY,
      ),
    ).toThrow(RangeError);
  });

  it("an override replaces the monthly spending and keeps the average", () => {
    const lines = estimateLines(
      [account(CHECKING)],
      groceriesThreeMonths,
      [
        { accountId: CHECKING, categoryId: GROCERIES, monthlyAmount: 25000 },
        { accountId: CHECKING, categoryId: LEISURE, monthlyAmount: 8000 },
        { accountId: 99, categoryId: LEISURE, monthlyAmount: 8000 },
      ],
      3,
      TODAY,
    );

    expect(lines).toEqual([
      {
        accountId: CHECKING,
        categoryId: GROCERIES,
        monthlySpending: 25000,
        monthsUsed: 3,
        averageSpending: 33000,
        overridden: true,
      },
      {
        accountId: CHECKING,
        categoryId: LEISURE,
        monthlySpending: 8000,
        monthsUsed: 3,
        averageSpending: 0,
        overridden: true,
      },
    ]);
  });
});

function daysFrom(first: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => addDays(first, index));
}

describe("spreadEvenly", () => {
  it("gives the remainder one minor unit at a time to the first days", () => {
    expect(spreadEvenly(10, daysFrom("2027-02-01", 4))).toEqual([3, 3, 2, 2]);
  });

  it("spreads nothing over no day", () => {
    expect(spreadEvenly(500, [])).toEqual([]);
  });

  it("the days of a spread add up to the amount exactly", () => {
    for (let days = 28; days <= 31; days += 1) {
      const dates = daysFrom("2027-01-01", days);
      for (let amount = 0; amount <= 400; amount += 1) {
        const shares = spreadEvenly(amount, dates);

        expect(shares).toHaveLength(days);
        expect(shares.reduce((sum, share) => sum + share, 0)).toBe(amount);
        expect(Math.max(...shares) - Math.min(...shares)).toBeLessThanOrEqual(1);
        shares.forEach((share, index) => {
          expect(share).toBeLessThanOrEqual(shares[index - 1] ?? share);
        });
      }
    }
  });

  it("refuses a negative amount", () => {
    expect(() => spreadEvenly(-1, daysFrom("2027-01-01", 2))).toThrow(RangeError);
  });
});

function line(monthlySpending: number, overrides: Partial<EstimateLine> = {}): EstimateLine {
  return {
    accountId: CHECKING,
    categoryId: GROCERIES,
    monthlySpending,
    monthsUsed: 3,
    averageSpending: monthlySpending,
    overridden: false,
    ...overrides,
  };
}

const DECEMBER = { from: TODAY, to: "2026-12-31" };

function amountsByDate(flows: readonly { date: string; amount: number }[]): Record<string, number> {
  return Object.fromEntries(flows.map(({ date, amount }) => [date, amount]));
}

describe("estimatedFlows", () => {
  it("estimates the rest of the current month over the remaining days, today included", () => {
    const flows = estimatedFlows(
      [line(33000)],
      [
        expense("2026-12-03", -12000),
        expense("2026-12-04", -5000, { categoryId: LEISURE }),
        expense("2026-12-04", -5000, { accountId: SAVINGS }),
        expense("2026-11-28", -5000),
        expense("2026-12-05", 40000, { type: "income" }),
        expense("2026-12-06", 300, { type: "interest" }),
      ],
      DECEMBER,
      TODAY,
    );

    const byDate = amountsByDate(flows);
    expect(flows).toHaveLength(22);
    expect(flows[0]).toEqual({
      accountId: CHECKING,
      categoryId: GROCERIES,
      date: TODAY,
      amount: -955,
    });
    expect(byDate["2026-12-21"]).toBe(-955);
    expect(byDate["2026-12-22"]).toBe(-954);
    expect(byDate["2026-12-31"]).toBe(-954);
    expect(flows.filter((flow) => flow.amount === -955)).toHaveLength(12);
    expect(flows.reduce((sum, flow) => sum + flow.amount, 0)).toBe(-21000);
  });

  it("estimates nothing more for the current month when the line already spent more than its estimate", () => {
    const flows = estimatedFlows(
      [line(33000)],
      [expense("2026-12-02", -20000), expense(TODAY, -14000)],
      DECEMBER,
      TODAY,
    );

    expect(flows).toEqual([]);
  });

  it("does not raise the current month estimate when refunds exceed spending", () => {
    const flows = estimatedFlows(
      [line(33000)],
      [
        expense("2026-12-02", -5000),
        expense("2026-12-05", 8000),
        expense("2026-12-06", -30000, { linkedToPlannedItem: true }),
        expense("2026-12-07", 50000, { type: "income" }),
        expense("2026-12-08", -10000, { type: "transfer" }),
        expense("2026-12-15", -10000),
      ],
      DECEMBER,
      TODAY,
    );

    expect(flows).toHaveLength(22);
    expect(flows.every((flow) => flow.amount === -1500)).toBe(true);
  });

  it("spreads a later month over all its days", () => {
    const flows = estimatedFlows(
      [line(31000)],
      [],
      { from: "2027-01-01", to: "2027-01-31" },
      TODAY,
    );

    expect(flows).toHaveLength(31);
    expect(flows[0]?.date).toBe("2027-01-01");
    expect(flows.at(-1)?.date).toBe("2027-01-31");
    expect(flows.every((flow) => flow.amount === -1000)).toBe(true);
  });

  it("a range that cuts a month keeps the daily amounts", () => {
    const january = estimatedFlows(
      [line(31015)],
      [],
      { from: "2027-01-10", to: "2027-01-20" },
      TODAY,
    );
    const december = estimatedFlows(
      [line(33000)],
      [expense("2026-12-03", -12000)],
      { from: "2026-12-20", to: "2026-12-23" },
      TODAY,
    );

    expect(amountsByDate(january)).toEqual({
      "2027-01-10": -1001,
      "2027-01-11": -1001,
      "2027-01-12": -1001,
      "2027-01-13": -1001,
      "2027-01-14": -1001,
      "2027-01-15": -1001,
      "2027-01-16": -1000,
      "2027-01-17": -1000,
      "2027-01-18": -1000,
      "2027-01-19": -1000,
      "2027-01-20": -1000,
    });
    expect(amountsByDate(december)).toEqual({
      "2026-12-20": -955,
      "2026-12-21": -955,
      "2026-12-22": -954,
      "2026-12-23": -954,
    });
  });

  it("produces no flow for a day with nothing to spread, nor before today", () => {
    const flows = estimatedFlows(
      [line(10), line(0, { categoryId: LEISURE })],
      [],
      { from: "2026-12-01", to: "2026-12-31" },
      TODAY,
    );

    expect(flows.map((flow) => flow.date)).toEqual(daysFrom(TODAY, 10));
    expect(flows.every((flow) => flow.amount === -1)).toBe(true);
  });

  it("orders flows by date, account, then category with uncategorized last", () => {
    const flows = estimatedFlows(
      [
        line(2200, { accountId: SAVINGS, categoryId: null }),
        line(2200, { categoryId: null }),
        line(2200, { categoryId: LEISURE }),
        line(2200),
        line(2200, { accountId: SAVINGS }),
      ],
      [],
      { from: TODAY, to: "2026-12-11" },
      TODAY,
    );

    const order = [
      [CHECKING, GROCERIES],
      [CHECKING, LEISURE],
      [CHECKING, null],
      [SAVINGS, GROCERIES],
      [SAVINGS, null],
    ];
    expect(flows.map(({ date, accountId, categoryId }) => [date, accountId, categoryId])).toEqual([
      ...order.map((key) => [TODAY, ...key]),
      ...order.map((key) => ["2026-12-11", ...key]),
    ]);
  });

  it("produces no flow for a range that ends before today", () => {
    expect(
      estimatedFlows([line(33000)], [], { from: "2026-11-01", to: "2026-12-09" }, TODAY),
    ).toEqual([]);
  });

  it("stops at the last supported day", () => {
    const flows = estimatedFlows(
      [line(2200)],
      [],
      { from: "9999-12-10", to: "9999-12-31" },
      "9999-12-10",
    );

    expect(flows).toHaveLength(22);
  });

  it("refuses a monthly spending below zero", () => {
    expect(() => estimatedFlows([line(-1)], [], DECEMBER, TODAY)).toThrow(RangeError);
  });

  it("refuses dates that are not calendar dates", () => {
    expect(() => estimatedFlows([line(2200)], [], DECEMBER, "1abc")).toThrow(RangeError);
    expect(() =>
      estimatedFlows([line(2200)], [], { from: TODAY, to: "2026-12-32" }, TODAY),
    ).toThrow(RangeError);
  });
});
