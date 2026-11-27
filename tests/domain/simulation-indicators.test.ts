import { describe, expect, it } from "vitest";

import { addDays } from "../../src/domain/calendar-date";
import type { ExchangeRate } from "../../src/domain/exchange-rate";
import type { DailyBalance, FlowSource } from "../../src/domain/projection";
import type { SimulatedFlow, SimulationResult } from "../../src/domain/simulation";
import {
  computeIndicators,
  totalCost,
  type IndicatorAccount,
  type IndicatorOptions,
} from "../../src/domain/simulation-indicators";

const TODAY = "2026-12-10";
const RANGE_FROM = "2026-12-01";
const RANGE_TO = "2027-03-31";
const CHECKING = 1;
const SAVINGS = 2;
const OTHER = 3;
const US_CHECKING = 4;
const CHF_SAVINGS = 5;
const ARCHIVED = 6;
/** 1 USD is worth 0.92 EUR, scaled by 10^8. */
const USD_TO_EUR = 92_000_000;

const checking: IndicatorAccount = {
  id: CHECKING,
  currency: "EUR",
  kind: "checking",
  archived: false,
};
const savings: IndicatorAccount = {
  id: SAVINGS,
  currency: "EUR",
  kind: "savings",
  archived: false,
};
const other: IndicatorAccount = { id: OTHER, currency: "EUR", kind: "other", archived: false };

const rates: ExchangeRate[] = [
  { date: "2026-01-01", base: "USD", quote: "EUR", rate: 50_000_000 },
  { date: "2026-12-01", base: "USD", quote: "EUR", rate: USD_TO_EUR },
];

function options(overrides: Partial<IndicatorOptions> = {}): IndicatorOptions {
  return {
    referenceCurrency: "EUR",
    rates,
    today: TODAY,
    range: { from: RANGE_FROM, to: RANGE_TO },
    savingsDate: "2027-01-31",
    ...overrides,
  };
}

/**
 * One day per date of the range; each account gets the balance its function gives for the date,
 * or no entry when it returns undefined (an account not open yet).
 */
function days(
  balances: Record<number, (date: string) => number | undefined>,
  range = { from: RANGE_FROM, to: RANGE_TO },
): DailyBalance[] {
  const result: DailyBalance[] = [];
  for (let date = range.from; date <= range.to; date = addDays(date, 1)) {
    const day = new Map<number, number>();
    for (const [id, balanceOn] of Object.entries(balances)) {
      const balance = balanceOn(date);
      if (balance !== undefined) day.set(Number(id), balance);
    }
    result.push({ date, balances: day });
  }
  return result;
}

const constant = (balance: number) => (): number => balance;

function simulation(dailyBalances: DailyBalance[], flows: SimulatedFlow[] = []): SimulationResult {
  return { days: dailyBalances, transfers: [], simulatedTransfers: [], flows };
}

const TRANSACTION: FlowSource = { kind: "transaction", transactionId: 1 };

function flow(overrides: Partial<SimulatedFlow> = {}): SimulatedFlow {
  return {
    accountId: CHECKING,
    date: "2026-12-15",
    amount: -1000,
    source: TRANSACTION,
    categoryId: null,
    external: true,
    ...overrides,
  };
}

describe("computeIndicators", () => {
  it("the final balance is the total of active accounts on the last day", () => {
    const archived: IndicatorAccount = { ...checking, id: ARCHIVED, archived: true };
    const result = simulation(
      days({
        [CHECKING]: (date) => (date === RANGE_TO ? 120000 : 100000),
        [SAVINGS]: constant(300000),
        [ARCHIVED]: constant(999999),
      }),
    );

    const indicators = computeIndicators(result, [checking, savings, archived], options());

    expect(indicators.finalBalance).toBe(420000);
  });

  it("the minimum balance is searched from today and keeps the first day it is reached", () => {
    const lows: Record<string, number> = {
      "2026-12-05": -50000,
      "2027-01-12": 10000,
      "2027-02-20": 10000,
    };
    const result = simulation(days({ [CHECKING]: (date) => lows[date] ?? 80000 }));

    const indicators = computeIndicators(result, [checking], options());

    expect(indicators.minimum).toEqual({ amount: 10000, date: "2027-01-12" });
  });

  it("savings at a date add only savings accounts", () => {
    const secondSavings: IndicatorAccount = { ...savings, id: 7 };
    const result = simulation(
      days({
        [CHECKING]: constant(100000),
        [SAVINGS]: (date) => (date === "2027-01-31" ? 250000 : 200000),
        7: constant(40000),
        [OTHER]: constant(70000),
      }),
    );

    const indicators = computeIndicators(
      result,
      [checking, savings, secondSavings, other],
      options(),
    );

    expect(indicators.savingsAt).toEqual({ date: "2027-01-31", amount: 290000 });
  });

  it("month-end curves split checking and savings and leave other accounts out", () => {
    const monthEnd: Record<string, number> = {
      "2026-12-31": 1000,
      "2027-01-31": 2000,
      "2027-02-28": 3000,
      "2027-03-31": 4000,
    };
    const result = simulation(
      days({
        [CHECKING]: (date) => monthEnd[date] ?? 0,
        [SAVINGS]: (date) => (monthEnd[date] ?? 0) * 10,
        [OTHER]: constant(500000),
      }),
    );

    const indicators = computeIndicators(result, [checking, savings, other], options());

    expect(indicators.monthEnds).toEqual([
      { month: "2026-12", checking: 1000, savings: 10000 },
      { month: "2027-01", checking: 2000, savings: 20000 },
      { month: "2027-02", checking: 3000, savings: 30000 },
      { month: "2027-03", checking: 4000, savings: 40000 },
    ]);
    expect(indicators.finalBalance).toBe(4000 + 40000 + 500000);
  });

  it("a partial last month ends on the range end", () => {
    const range = { from: RANGE_FROM, to: "2027-03-15" };
    const result = simulation(
      days({ [CHECKING]: (date) => (date === "2027-03-15" ? 7000 : 1000) }, range),
    );

    const indicators = computeIndicators(result, [checking], options({ range }));

    expect(indicators.monthEnds.at(-1)).toEqual({ month: "2027-03", checking: 7000, savings: 0 });
    expect(indicators.monthEnds).toHaveLength(4);
  });

  it("converts each account with the latest known rate", () => {
    const usChecking: IndicatorAccount = { ...checking, id: US_CHECKING, currency: "USD" };
    const result = simulation(days({ [US_CHECKING]: constant(10000) }));

    const indicators = computeIndicators(result, [usChecking], options());

    expect(indicators.finalBalance).toBe(9200);
    expect(indicators.monthEnds[0]).toEqual({ month: "2026-12", checking: 9200, savings: 0 });
    expect(indicators.missingRates).toEqual([]);
  });

  it("leaves out an account without rate and names its currency", () => {
    const chfSavings: IndicatorAccount = { ...savings, id: CHF_SAVINGS, currency: "CHF" };
    const chfOther: IndicatorAccount = { ...other, id: 8, currency: "CHF" };
    const result = simulation(
      days({
        [CHECKING]: constant(100000),
        [CHF_SAVINGS]: constant(500000),
        8: constant(-900000),
      }),
    );

    const indicators = computeIndicators(result, [checking, chfSavings, chfOther], options());

    expect(indicators.finalBalance).toBe(100000);
    expect(indicators.minimum).toEqual({ amount: 100000, date: TODAY });
    expect(indicators.savingsAt.amount).toBe(0);
    expect(indicators.missingRates).toEqual(["CHF"]);
  });

  it("external outflows count expenses and loan payments, not transfers, incomes or interest", () => {
    const loanPayment: FlowSource = { kind: "modification", modificationId: 3 };
    const result = simulation(days({ [CHECKING]: constant(0), [SAVINGS]: constant(0) }), [
      flow({ amount: -1500 }),
      flow({ amount: -20000, source: loanPayment }),
      flow({ amount: 300000, source: loanPayment }),
      flow({ amount: 250000 }),
      flow({ accountId: SAVINGS, amount: 1200, source: { kind: "estimate", categoryId: null } }),
      flow({ amount: -40000, external: false }),
      flow({ accountId: SAVINGS, amount: 40000, external: false }),
    ]);

    const indicators = computeIndicators(result, [checking, savings], options());

    expect(indicators.externalOutflows).toBe(21500);
  });

  it("external outflows leave out flows before today, of archived or unknown accounts, or without rate", () => {
    const usChecking: IndicatorAccount = { ...checking, id: US_CHECKING, currency: "USD" };
    const chfSavings: IndicatorAccount = { ...savings, id: CHF_SAVINGS, currency: "CHF" };
    const archived: IndicatorAccount = { ...checking, id: ARCHIVED, archived: true };
    const result = simulation(days({ [CHECKING]: constant(0) }), [
      flow({ date: "2026-12-09", amount: -100 }),
      flow({ date: TODAY, amount: -1000 }),
      flow({ date: RANGE_TO, amount: -2000 }),
      flow({ accountId: US_CHECKING, amount: -10000 }),
      flow({ accountId: CHF_SAVINGS, amount: -5000 }),
      flow({ accountId: ARCHIVED, amount: -7000 }),
      flow({ accountId: 99, amount: -8000 }),
    ]);

    const indicators = computeIndicators(
      result,
      [checking, usChecking, chfSavings, archived],
      options(),
    );

    expect(indicators.externalOutflows).toBe(1000 + 2000 + 9200);
    expect(indicators.missingRates).toEqual(["CHF"]);
  });

  it("an account with no balance on a day counts as zero that day", () => {
    const result = simulation(
      days({
        [CHECKING]: constant(50000),
        [SAVINGS]: (date) => (date >= "2027-02-01" ? 30000 : undefined),
      }),
    );

    const indicators = computeIndicators(result, [checking, savings], options());

    expect(indicators.monthEnds[0]).toEqual({ month: "2026-12", checking: 50000, savings: 0 });
    expect(indicators.minimum).toEqual({ amount: 50000, date: TODAY });
    expect(indicators.finalBalance).toBe(80000);
  });

  it("refuses a savings date outside the range", () => {
    const result = simulation(days({ [CHECKING]: constant(0) }));

    expect(() =>
      computeIndicators(result, [checking], options({ savingsDate: "2027-04-01" })),
    ).toThrow(
      new RangeError("Savings date 2027-04-01 is outside the range 2026-12-01 to 2027-03-31"),
    );
  });

  it("refuses a today outside the range", () => {
    const result = simulation(days({ [CHECKING]: constant(0) }));

    expect(() => computeIndicators(result, [checking], options({ today: "2026-11-30" }))).toThrow(
      new RangeError("Today 2026-11-30 is outside the range 2026-12-01 to 2027-03-31"),
    );
  });
});

describe("totalCost", () => {
  it("total cost is the scenario minus the reference", () => {
    const balances = days({ [CHECKING]: constant(100000) });
    const referenceFlows = [flow({ amount: -3000 })];
    const reference = computeIndicators(
      simulation(balances, referenceFlows),
      [checking],
      options(),
    );
    const scenario = computeIndicators(
      simulation(balances, [...referenceFlows, flow({ date: "2027-01-05", amount: -50000 })]),
      [checking],
      options(),
    );

    expect(totalCost(scenario, reference)).toBe(50000);
    expect(totalCost(reference, reference)).toBe(0);
  });
});
