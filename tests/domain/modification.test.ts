import { describe, expect, it } from "vitest";

import type { OneOffPurchase } from "../../src/domain/modification";
import {
  modificationLabelSchema,
  parseModificationParameters,
} from "../../src/domain/modification-parameters";
import type { ProjectionAccount } from "../../src/domain/projection";
import type { DateRange } from "../../src/domain/recurrence";
import {
  evaluateConstantPace,
  evaluateScenario,
  type SimulationInput,
  type SimulationResult,
} from "../../src/domain/simulation";

const TODAY = "2026-12-10";
const CHECKING = 1;
const SAVINGS = 2;
const GROCERIES = 30;
const LEISURE = 31;
const MISSING_CATEGORY = 99;
const RANGE: DateRange = { from: "2026-12-01", to: "2027-01-31" };
const PURCHASE_DAY = "2027-01-10";

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

function input(overrides: Partial<SimulationInput> = {}): SimulationInput {
  return {
    accounts: [account(), account({ id: SAVINGS, openingBalance: 0, archived: true })],
    realFlows: [],
    items: [],
    itemCategories: new Map(),
    categoryIds: new Set([GROCERIES, LEISURE]),
    estimates: [{ accountId: CHECKING, categoryId: GROCERIES, date: PURCHASE_DAY, amount: -3000 }],
    today: TODAY,
    range: RANGE,
    ...overrides,
  };
}

function purchase(
  overrides: Partial<Omit<OneOffPurchase, "parameters">> = {},
  parameters: Partial<OneOffPurchase["parameters"]> = {},
): OneOffPurchase {
  return {
    id: 1,
    position: 0,
    label: "New laptop",
    type: "one_off_purchase",
    parameters: {
      accountId: CHECKING,
      date: PURCHASE_DAY,
      amount: 50000,
      categoryId: LEISURE,
      ...parameters,
    },
    ...overrides,
  };
}

function modificationFlows(result: SimulationResult) {
  return result.flows.filter((flow) => flow.source.kind === "modification");
}

function balanceOn(result: SimulationResult, date: string): number | undefined {
  return result.days.find((day) => day.date === date)?.balances.get(CHECKING);
}

describe("evaluateScenario", () => {
  it("an empty list gives the constant-pace simulation", () => {
    const { problems, ...result } = evaluateScenario(input(), []);

    expect(problems).toEqual([]);
    expect(result).toEqual(evaluateConstantPace(input()));
    expect(result.flows.map((flow) => flow.source.kind)).toEqual(["estimate"]);
    expect(balanceOn(result, PURCHASE_DAY)).toBe(97000);
  });

  it("a one-off purchase of 50000 on 2027-01-10 adds one outflow on that day with its source and category", () => {
    const result = evaluateScenario(input(), [purchase()]);

    expect(result.problems).toEqual([]);
    expect(modificationFlows(result)).toEqual([
      {
        accountId: CHECKING,
        date: PURCHASE_DAY,
        amount: -50000,
        categoryId: LEISURE,
        external: true,
        source: { kind: "modification", modificationId: 1 },
      },
    ]);
    expect(balanceOn(result, "2027-01-09")).toBe(100000);
    expect(balanceOn(result, PURCHASE_DAY)).toBe(100000 - 3000 - 50000);
  });

  it("a one-off purchase outside the range adds nothing", () => {
    const result = evaluateScenario(input(), [purchase({}, { date: "2027-02-01" })]);

    expect(result.problems).toEqual([]);
    expect(modificationFlows(result)).toEqual([]);
  });

  it("a one-off purchase dated today or before is invalid and adds nothing", () => {
    // Checked before the range: a date before the range is still reported, not silently dropped.
    const result = evaluateScenario(input(), [
      purchase({ id: 1 }, { date: TODAY }),
      purchase({ id: 2, position: 1 }, { date: "2026-11-15" }),
    ]);

    expect(result.problems).toEqual([
      { modificationId: 1, reason: "dateNotAfterToday" },
      { modificationId: 2, reason: "dateNotAfterToday" },
    ]);
    expect(modificationFlows(result)).toEqual([]);
  });

  it("a modification on an archived account is invalid and the others still apply", () => {
    const result = evaluateScenario(input(), [
      purchase({ id: 1, position: 0 }, { accountId: SAVINGS }),
      purchase({ id: 2, position: 1 }),
      purchase({ id: 3, position: 2 }, { accountId: 404 }),
    ]);

    expect(result.problems).toEqual([
      { modificationId: 1, reason: "accountArchived" },
      { modificationId: 3, reason: "accountMissing" },
    ]);
    expect(modificationFlows(result).map((flow) => flow.source)).toEqual([
      { kind: "modification", modificationId: 2 },
    ]);
  });

  it("a modification on a missing category is invalid", () => {
    const result = evaluateScenario(input(), [purchase({}, { categoryId: MISSING_CATEGORY })]);

    expect(result.problems).toEqual([{ modificationId: 1, reason: "categoryMissing" }]);
    expect(modificationFlows(result)).toEqual([]);
    // Without the list of categories, a categorized modification cannot be checked, so it is invalid.
    const withoutCategories = input({ categoryIds: undefined });
    expect(
      evaluateScenario(withoutCategories, [
        purchase({ id: 1 }),
        purchase({ id: 2, position: 1 }, { categoryId: null }),
      ]).problems,
    ).toEqual([{ modificationId: 1, reason: "categoryMissing" }]);
  });

  it("modifications apply by position, then id", () => {
    const result = evaluateScenario(input(), [
      purchase({ id: 3, position: 1 }, { amount: 300 }),
      purchase({ id: 2, position: 0 }, { amount: 200 }),
      purchase({ id: 1, position: 1 }, { amount: 100 }),
    ]);

    // On the same day, the flows of stage A come after the estimates (DOMAIN, D5).
    expect(
      result.flows
        .filter((flow) => flow.date === PURCHASE_DAY)
        .map((flow) =>
          flow.source.kind === "modification" ? flow.source.modificationId : flow.source.kind,
        ),
    ).toEqual(["estimate", 2, 1, 3]);
  });
});

describe("parseModificationParameters", () => {
  const valid = { accountId: CHECKING, date: PURCHASE_DAY, amount: 50000, categoryId: null };

  it("the parameters schema refuses a negative or decimal amount, a bad date and an unknown key", () => {
    expect(parseModificationParameters("one_off_purchase", valid)).toEqual({
      ok: true,
      parameters: valid,
    });
    for (const value of [
      { ...valid, amount: -50000 },
      { ...valid, amount: 0 },
      { ...valid, amount: 500.5 },
      { ...valid, date: "2027-02-30" },
      { ...valid, date: "10/01/2027" },
      { ...valid, note: "gift" },
    ]) {
      expect(parseModificationParameters("one_off_purchase", value)).toEqual({
        ok: false,
        reason: "parametersInvalid",
      });
    }
  });

  it("a type without a schema yet is refused as parametersInvalid", () => {
    expect(parseModificationParameters("loan", valid)).toEqual({
      ok: false,
      reason: "parametersInvalid",
    });
    // Stored rows are not trusted: an unknown type or corrupted parameters are reported, never thrown.
    const stored = [
      { ...purchase({ id: 1 }), type: "loan" },
      { ...purchase({ id: 2 }), type: "constructor" },
      { ...purchase({ id: 3 }), parameters: null },
      { ...purchase({ id: 4 }), parameters: "corrupted" },
    ] as unknown as OneOffPurchase[];
    expect(evaluateScenario(input(), stored).problems).toEqual(
      [1, 2, 3, 4].map((modificationId) => ({ modificationId, reason: "parametersInvalid" })),
    );
  });
});

describe("modificationLabelSchema", () => {
  it("a label of 81 characters or only spaces is refused", () => {
    expect(modificationLabelSchema.safeParse(" New laptop ").success).toBe(true);
    expect(modificationLabelSchema.safeParse("a".repeat(80)).success).toBe(true);
    expect(modificationLabelSchema.safeParse("a".repeat(81)).success).toBe(false);
    expect(modificationLabelSchema.safeParse("   ").success).toBe(false);
  });
});
