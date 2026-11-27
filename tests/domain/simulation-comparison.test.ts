import { describe, expect, it } from "vitest";

import type { HorizonChoice } from "../../src/domain/horizon";
import type { OneOffPurchase } from "../../src/domain/modification";
import type { DailyBalance, ProjectionAccount } from "../../src/domain/projection";
import type { SimulatedFlow, SimulationInput } from "../../src/domain/simulation";
import {
  compareSimulations,
  ComparisonValidationError,
  type ComparedScenario,
} from "../../src/domain/simulation-comparison";

const TODAY = "2026-11-26";
const CHECKING = 1;
const SAVINGS = 2;
const SIX_MONTHS: HorizonChoice = { kind: "months", months: 6 };
const OPTIONS = { referenceCurrency: "EUR", rates: [], today: TODAY };

function account(overrides: Partial<ProjectionAccount> = {}): ProjectionAccount {
  return {
    id: CHECKING,
    currency: "EUR",
    openingDate: "2026-01-01",
    openingBalance: 200000,
    ceiling: null,
    overflowAccountId: null,
    archived: false,
    ...overrides,
  };
}

function realFlow(transactionId: number, date: string, amount: number): SimulatedFlow {
  return {
    accountId: CHECKING,
    date,
    amount,
    source: { kind: "transaction", transactionId },
    categoryId: null,
    external: true,
  };
}

const input: Omit<SimulationInput, "range"> = {
  accounts: [account(), account({ id: SAVINGS, openingBalance: 50000 })],
  realFlows: [realFlow(1, "2026-11-10", -12000), realFlow(2, TODAY, -3000)],
  items: [],
  itemCategories: new Map(),
  accountKinds: new Map([[CHECKING, "checking"]]),
  estimates: [{ accountId: CHECKING, categoryId: null, date: "2026-12-05", amount: -4000 }],
  today: TODAY,
};

function purchase(id: number, date: string, amount: number): OneOffPurchase {
  return {
    id,
    position: 0,
    label: "New bike",
    type: "one_off_purchase",
    parameters: { accountId: CHECKING, date, amount, categoryId: null },
  };
}

function scenario(id: number, overrides: Partial<ComparedScenario> = {}): ComparedScenario {
  return {
    id,
    name: `Scenario ${id}`,
    status: "draft",
    modifications: [purchase(id, "2027-01-15", 50000)],
    ...overrides,
  };
}

function refusal(run: () => unknown): ComparisonValidationError {
  try {
    run();
  } catch (error) {
    if (error instanceof ComparisonValidationError) return error;
    throw error;
  }
  throw new Error("Expected a ComparisonValidationError");
}

describe("compareSimulations", () => {
  it("the constant-pace simulation comes first with a total cost of 0", () => {
    const comparison = compareSimulations(input, [scenario(7)], SIX_MONTHS, OPTIONS);

    expect(comparison.range).toEqual({ from: TODAY, to: "2027-05-31" });
    expect(comparison.simulations.map(({ scenarioId, name }) => ({ scenarioId, name }))).toEqual([
      { scenarioId: null, name: null },
      { scenarioId: 7, name: "Scenario 7" },
    ]);
    expect(comparison.simulations[0]?.totalCost).toBe(0);
  });

  it("zero or four scenarios are refused", () => {
    const four = [scenario(1), scenario(2), scenario(3), scenario(4)];

    for (const scenarios of [[], four]) {
      const error = refusal(() => compareSimulations(input, scenarios, SIX_MONTHS, OPTIONS));
      expect(error.ref).toEqual({ key: "comparisonSize" });
    }
  });

  it("accepts three scenarios", () => {
    const scenarios = [scenario(1), scenario(2), scenario(3)];

    expect(compareSimulations(input, scenarios, SIX_MONTHS, OPTIONS).simulations).toHaveLength(4);
  });

  it("a validated scenario is refused", () => {
    const scenarios = [scenario(1), scenario(2, { status: "validated" })];

    const error = refusal(() => compareSimulations(input, scenarios, SIX_MONTHS, OPTIONS));
    expect(error.ref).toEqual({ key: "scenarioValidated" });
  });

  it("every simulation has the same days up to today", () => {
    const early = scenario(2, { modifications: [purchase(2, "2026-11-27", 20000)] });

    const [reference, ...others] = compareSimulations(
      input,
      [scenario(1), early],
      SIX_MONTHS,
      OPTIONS,
    ).simulations;

    const upToToday = (days: DailyBalance[] | undefined) =>
      days?.filter((day) => day.date <= TODAY);
    expect(upToToday(reference?.result.days)).toEqual([
      {
        date: TODAY,
        balances: new Map([
          [CHECKING, 185000],
          [SAVINGS, 50000],
        ]),
      },
    ]);
    for (const simulation of others) {
      expect(upToToday(simulation.result.days)).toEqual(upToToday(reference?.result.days));
    }
    const dayAfter = (days: DailyBalance[] | undefined) =>
      days?.find((day) => day.date === "2026-11-27")?.balances.get(CHECKING);
    expect(dayAfter(others[1]?.result.days)).toBe(165000);
    expect(dayAfter(reference?.result.days)).toBe(185000);
  });

  it("the total cost of a scenario is its external outflows minus the reference's", () => {
    const [reference, bike] = compareSimulations(
      input,
      [scenario(1)],
      SIX_MONTHS,
      OPTIONS,
    ).simulations;

    expect(reference?.indicators.externalOutflows).toBe(7000);
    expect(bike?.indicators.externalOutflows).toBe(57000);
    expect(bike?.totalCost).toBe(50000);
  });

  it("reports the problems of each scenario", () => {
    const onToday = scenario(1, { modifications: [purchase(1, TODAY, 20000)] });

    const [, simulation] = compareSimulations(input, [onToday], SIX_MONTHS, OPTIONS).simulations;

    expect(simulation?.problems).toEqual([{ modificationId: 1, reason: "dateNotAfterToday" }]);
    expect(simulation?.totalCost).toBe(0);
  });

  it("counts an account without a kind as other: in the totals, never in a curve", () => {
    const [reference] = compareSimulations(input, [scenario(1)], SIX_MONTHS, OPTIONS).simulations;

    expect(reference?.indicators.monthEnds[0]).toEqual({
      month: "2026-11",
      checking: 185000,
      savings: 0,
    });
    expect(reference?.indicators.finalBalance).toBe(231000);
  });

  it("reads the savings at the end of the range by default, or at the given date", () => {
    const savingsInput = { ...input, accountKinds: new Map([[SAVINGS, "savings" as const]]) };

    const byDefault = compareSimulations(savingsInput, [scenario(1)], SIX_MONTHS, OPTIONS);
    const given = compareSimulations(savingsInput, [scenario(1)], SIX_MONTHS, {
      ...OPTIONS,
      savingsDate: "2027-01-31",
    });

    expect(byDefault.simulations[0]?.indicators.savingsAt).toEqual({
      date: "2027-05-31",
      amount: 50000,
    });
    expect(given.simulations[0]?.indicators.savingsAt.date).toBe("2027-01-31");
  });

  it("refuses a savings date outside the range, never clamps it", () => {
    for (const savingsDate of ["2026-11-25", "2027-06-01"]) {
      expect(() =>
        compareSimulations(input, [scenario(1)], SIX_MONTHS, { ...OPTIONS, savingsDate }),
      ).toThrow(RangeError);
    }
  });

  it("refuses a malformed savings date before any evaluation", () => {
    expect(() =>
      compareSimulations(input, [scenario(1)], SIX_MONTHS, {
        ...OPTIONS,
        savingsDate: "2027-02-30",
      }),
    ).toThrow("Savings date 2027-02-30 is not a calendar date");
  });

  it("refuses indicator options with another today than the input", () => {
    expect(() =>
      compareSimulations(input, [scenario(1)], SIX_MONTHS, { ...OPTIONS, today: "2026-12-10" }),
    ).toThrow(RangeError);
  });
});
