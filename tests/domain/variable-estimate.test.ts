import { describe, expect, it } from "vitest";

import { addDays } from "../../src/domain/calendar-date";

import {
  estimateLines,
  spreadEvenly,
  type EstimateAccount,
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
