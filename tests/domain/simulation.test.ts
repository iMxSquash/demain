import { describe, expect, it } from "vitest";

import type { ResolvedOccurrence } from "../../src/domain/occurrence-resolution";
import {
  projectWithRouting,
  type DailyBalance,
  type PlannedItemOccurrences,
  type ProjectionAccount,
} from "../../src/domain/projection";
import type { DateRange } from "../../src/domain/recurrence";
import {
  evaluateConstantPace,
  type SimulatedFlow,
  type SimulationInput,
} from "../../src/domain/simulation";
import {
  estimatedFlows,
  type EstimatedFlow,
  type EstimateLine,
  type EstimateTransaction,
} from "../../src/domain/variable-estimate";

const TODAY = "2026-12-10";
const CHECKING = 1;
const LIVRET_A = 3;
const LIVRET_JEUNE = 4;
const RENT_ITEM = 10;
const TRANSFER_ITEM = 20;
const GROCERIES = 30;
const HOUSING = 31;
const DECEMBER: DateRange = { from: "2026-12-01", to: "2026-12-31" };
const PLANNED_DAY = "2026-12-15";

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

const livretJeune = account({
  id: LIVRET_JEUNE,
  openingBalance: 155000,
  ceiling: 160000,
  overflowAccountId: LIVRET_A,
});
const livretA = account({ id: LIVRET_A, openingBalance: 0 });

function occurrence(date: string, amount: number): ResolvedOccurrence {
  return {
    nominalDate: date,
    date,
    versionIndex: 0,
    amount,
    isAmountOverridden: false,
    isCancelled: false,
    expectedAmount: amount,
    links: [],
    linkedSum: 0,
    remaining: amount,
    status: "planned",
    period: null,
  };
}

function rentItem(date: string, amount: number): PlannedItemOccurrences {
  return {
    plannedItemId: RENT_ITEM,
    kind: "expense",
    accountId: CHECKING,
    destinationAccountId: null,
    occurrences: [occurrence(date, amount)],
  };
}

// A planned transfer is stored with a negative amount: it leaves its source account.
function transferItem(amount: number, destinationAccountId: number): PlannedItemOccurrences {
  return {
    plannedItemId: TRANSFER_ITEM,
    kind: "transfer",
    accountId: CHECKING,
    destinationAccountId,
    occurrences: [occurrence(PLANNED_DAY, -amount)],
  };
}

function realFlow(
  transactionId: number,
  date: string,
  amount: number,
  categoryId: number | null = GROCERIES,
): SimulatedFlow {
  return {
    accountId: CHECKING,
    date,
    amount,
    source: { kind: "transaction", transactionId },
    categoryId,
    external: true,
  };
}

function estimate(date: string, amount: number, accountId = CHECKING): EstimatedFlow {
  return { accountId, categoryId: GROCERIES, date, amount };
}

function input(overrides: Partial<SimulationInput> = {}): SimulationInput {
  return {
    accounts: [account()],
    realFlows: [],
    items: [],
    itemCategories: new Map(),
    estimates: [],
    today: TODAY,
    range: DECEMBER,
    ...overrides,
  };
}

function balanceOn(
  days: readonly DailyBalance[],
  date: string,
  accountId = CHECKING,
): number | undefined {
  return days.find((day) => day.date === date)?.balances.get(accountId);
}

describe("evaluateConstantPace", () => {
  describe("with groceries spent at 31000 a month and a rent planned in January", () => {
    const range: DateRange = { from: "2026-12-01", to: "2027-01-31" };
    const groceries: EstimateLine = {
      accountId: CHECKING,
      categoryId: GROCERIES,
      monthlySpending: 31000,
      monthsUsed: 3,
      averageSpending: 31000,
      overridden: false,
    };
    // 11000 already spent in December: 20000 remain for the month, spread from today.
    const spent: EstimateTransaction = {
      accountId: CHECKING,
      categoryId: GROCERIES,
      date: "2026-12-03",
      amount: -11000,
      type: "expense",
      linkedToPlannedItem: false,
    };
    const simulation = input({
      accounts: [account({ openingBalance: 111000 })],
      realFlows: [realFlow(1, "2026-12-03", -11000)],
      items: [rentItem("2027-01-05", -60000)],
      itemCategories: new Map([[RENT_ITEM, HOUSING]]),
      estimates: estimatedFlows([groceries], [spent], range, TODAY),
      range,
    });

    it("the constant-pace simulation adds the estimates to the planned trajectory", () => {
      const { days } = evaluateConstantPace(simulation);

      expect(balanceOn(days, "2026-12-09")).toBe(100000);
      expect(balanceOn(days, "2026-12-31")).toBe(80000);
      // 100000 - 60000 (rent) - 31000 (January) - 20000 (December remainder)
      expect(balanceOn(days, "2027-01-31")).toBe(-11000);
    });

    it("real flows up to today are the same in the simulation and in the projection", () => {
      const result = evaluateConstantPace(simulation);
      const projection = projectWithRouting(
        simulation.accounts,
        simulation.realFlows,
        simulation.items,
        TODAY,
        range,
      );

      const beforeToday = (days: readonly DailyBalance[]) => days.filter((day) => day.date < TODAY);
      expect(beforeToday(result.days)).toEqual(beforeToday(projection.days));
      expect(result.flows.filter((flow) => flow.source.kind === "transaction")).toEqual(
        simulation.realFlows,
      );
    });
  });

  it("flows carry their source and their category; transfer legs are not external", () => {
    const transferSource = {
      kind: "occurrence",
      plannedItemId: TRANSFER_ITEM,
      nominalDate: PLANNED_DAY,
    } as const;
    const real = realFlow(1, "2026-12-03", -11000);

    const result = evaluateConstantPace(
      input({
        accounts: [account(), livretJeune, livretA],
        realFlows: [real],
        items: [transferItem(20000, LIVRET_JEUNE), rentItem(PLANNED_DAY, -45000)],
        itemCategories: new Map([
          [RENT_ITEM, HOUSING],
          // A transfer leg never carries a category, even when the map gives one.
          [TRANSFER_ITEM, GROCERIES],
        ]),
        estimates: [estimate(PLANNED_DAY, -500)],
      }),
    );

    expect(result.flows).toEqual([
      real,
      {
        accountId: CHECKING,
        date: PLANNED_DAY,
        amount: -45000,
        source: { kind: "occurrence", plannedItemId: RENT_ITEM, nominalDate: PLANNED_DAY },
        categoryId: HOUSING,
        external: true,
      },
      {
        accountId: CHECKING,
        date: PLANNED_DAY,
        amount: -5000,
        source: transferSource,
        categoryId: null,
        external: false,
      },
      {
        accountId: LIVRET_JEUNE,
        date: PLANNED_DAY,
        amount: 5000,
        source: transferSource,
        categoryId: null,
        external: false,
      },
      {
        accountId: CHECKING,
        date: PLANNED_DAY,
        amount: -15000,
        source: transferSource,
        categoryId: null,
        external: false,
      },
      {
        accountId: LIVRET_A,
        date: PLANNED_DAY,
        amount: 15000,
        source: transferSource,
        categoryId: null,
        external: false,
      },
      {
        accountId: CHECKING,
        date: PLANNED_DAY,
        amount: -500,
        source: { kind: "estimate", categoryId: GROCERIES },
        categoryId: GROCERIES,
        external: true,
      },
    ]);
    expect(result.simulatedTransfers).toEqual([]);
  });

  it("estimates on the same day apply after planned occurrences", () => {
    const result = evaluateConstantPace(
      input({
        accounts: [account(), livretJeune, livretA],
        items: [transferItem(10000, LIVRET_JEUNE)],
        estimates: [estimate(PLANNED_DAY, -5000, LIVRET_JEUNE)],
      }),
    );

    // Applied first, the estimate would have freed 5000 more room on the Livret Jeune.
    const routing = result.transfers[0]?.routing;
    expect(routing?.status === "ok" ? routing.placements : undefined).toEqual([
      { accountId: LIVRET_JEUNE, amount: 5000 },
      { accountId: LIVRET_A, amount: 5000 },
    ]);
    expect(result.flows.map((flow) => flow.source.kind)).toEqual([
      "occurrence",
      "occurrence",
      "occurrence",
      "occurrence",
      "estimate",
    ]);
    expect(balanceOn(result.days, PLANNED_DAY, LIVRET_JEUNE)).toBe(155000);
  });

  it("reports only the placed part of a planned transfer; the unplaced part stays on the source", () => {
    const cappedLivretA = account({ id: LIVRET_A, openingBalance: 0, ceiling: 10000 });

    const result = evaluateConstantPace(
      input({
        accounts: [account(), livretJeune, cappedLivretA],
        items: [transferItem(20000, LIVRET_JEUNE)],
      }),
    );

    expect(result.flows.map(({ accountId, amount }) => [accountId, amount])).toEqual([
      [CHECKING, -5000],
      [LIVRET_JEUNE, 5000],
      [CHECKING, -10000],
      [LIVRET_A, 10000],
    ]);
    expect(balanceOn(result.days, PLANNED_DAY)).toBe(85000);
  });

  it("reports no flow for a planned transfer on an invalid chain", () => {
    const cyclic = [
      account(),
      account({ id: LIVRET_JEUNE, openingBalance: 0, ceiling: 1000, overflowAccountId: LIVRET_A }),
      account({ id: LIVRET_A, openingBalance: 0, ceiling: 1000, overflowAccountId: LIVRET_JEUNE }),
    ];

    const result = evaluateConstantPace(
      input({ accounts: cyclic, items: [transferItem(5000, LIVRET_JEUNE)] }),
    );

    expect(result.transfers[0]?.routing).toEqual({ status: "invalid", reason: "cycle" });
    expect(result.flows).toEqual([]);
  });

  it("reports no flow after the range, and none for an empty range", () => {
    const simulation = input({
      realFlows: [realFlow(1, "2026-12-03", -11000)],
      estimates: [estimate("2026-12-31", -500), estimate("2027-01-01", -500)],
    });

    expect(evaluateConstantPace(simulation).flows.map((flow) => flow.date)).toEqual([
      "2026-12-03",
      "2026-12-31",
    ]);
    expect(
      evaluateConstantPace({ ...simulation, range: { from: "2026-12-31", to: "2026-12-01" } })
        .flows,
    ).toEqual([]);
  });

  it("reports no flow on an account out of the list, and only the source leg of a transfer to one", () => {
    const result = evaluateConstantPace(
      input({
        items: [transferItem(5000, 99)],
        estimates: [estimate(PLANNED_DAY, -500, 99)],
      }),
    );

    expect(
      result.flows.map(({ accountId, amount, external }) => [accountId, amount, external]),
    ).toEqual([[CHECKING, -5000, false]]);
    expect(balanceOn(result.days, PLANNED_DAY)).toBe(95000);
  });
});
