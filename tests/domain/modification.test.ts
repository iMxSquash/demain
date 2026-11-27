import { describe, expect, it } from "vitest";

import type { OneOffPurchase, SubscriptionChange } from "../../src/domain/modification";
import {
  modificationLabelSchema,
  parseModificationParameters,
} from "../../src/domain/modification-parameters";
import type { ResolvedOccurrence } from "../../src/domain/occurrence-resolution";
import type { PlannedItemOccurrences, ProjectionAccount } from "../../src/domain/projection";
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

// A synthetic "Music streaming" subscription: -1299 every month on day 5, from the first one after today.
const STREAMING_ITEM = 10;
const SALARY_ITEM = 11;
const STREAMING_AMOUNT = 1299;
const HORIZON: DateRange = { from: "2026-12-01", to: "2028-11-30" };

function occurrence(nominalDate: string, date = nominalDate): ResolvedOccurrence {
  return {
    nominalDate,
    date,
    versionIndex: 0,
    amount: -STREAMING_AMOUNT,
    isAmountOverridden: false,
    isCancelled: false,
    expectedAmount: -STREAMING_AMOUNT,
    links: [],
    linkedSum: 0,
    remaining: -STREAMING_AMOUNT,
    status: "planned",
    period: null,
  };
}

/** Day 5 of each month from 2027-01 to 2028-11: 23 dates, all after today. */
function streamingDates(): string[] {
  return Array.from({ length: 23 }, (_, index) => {
    const year = 2027 + Math.floor(index / 12);
    const month = (index % 12) + 1;
    return `${year}-${String(month).padStart(2, "0")}-05`;
  });
}

function streamingItem(overrides: Partial<PlannedItemOccurrences> = {}): PlannedItemOccurrences {
  return {
    plannedItemId: STREAMING_ITEM,
    kind: "expense",
    accountId: CHECKING,
    destinationAccountId: null,
    occurrences: streamingDates().map((date) => occurrence(date)),
    ...overrides,
  };
}

function subscriptionInput(overrides: Partial<SimulationInput> = {}): SimulationInput {
  return input({
    items: [streamingItem()],
    itemCategories: new Map([[STREAMING_ITEM, LEISURE]]),
    estimates: [],
    range: HORIZON,
    ...overrides,
  });
}

function change(
  overrides: Partial<Omit<SubscriptionChange, "parameters">> = {},
  parameters: Partial<SubscriptionChange["parameters"]> = {},
): SubscriptionChange {
  return {
    id: 1,
    position: 0,
    label: "Music streaming",
    type: "subscription_change",
    parameters: {
      target: { kind: "existing", plannedItemId: STREAMING_ITEM },
      mode: "yearly",
      // The schema refuses an amount key with the mode none, so the default is only set without it.
      ...(parameters.mode === "none" ? {} : { amount: 12990 }),
      startDate: "2027-01-05",
      ...parameters,
    },
    ...overrides,
  };
}

function itemFlowDates(result: SimulationResult, plannedItemId = STREAMING_ITEM): string[] {
  return result.flows.flatMap((flow) =>
    flow.source.kind === "occurrence" && flow.source.plannedItemId === plannedItemId
      ? [flow.source.nominalDate]
      : [],
  );
}

function addedFlows(result: SimulationResult) {
  return modificationFlows(result).map(({ date, amount, source }) => ({
    date,
    amount,
    modificationId: source.kind === "modification" ? source.modificationId : null,
  }));
}

describe("subscription change", () => {
  it("yearly from 2027-01-05 removes the monthly occurrences and adds -12990 on 2027-01-05 and 2028-01-05", () => {
    const result = evaluateScenario(subscriptionInput(), [change()]);

    expect(result.problems).toEqual([]);
    expect(itemFlowDates(result)).toEqual([]);
    expect(modificationFlows(result)).toEqual(
      ["2027-01-05", "2028-01-05"].map((date) => ({
        accountId: CHECKING,
        date,
        amount: -12990,
        categoryId: LEISURE,
        external: true,
        source: { kind: "modification", modificationId: 1 },
      })),
    );
  });

  it("none from 2027-01-05 removes every occurrence from that date", () => {
    const result = evaluateScenario(subscriptionInput(), [change({}, { mode: "none" })]);

    expect(result.problems).toEqual([]);
    expect(itemFlowDates(result)).toEqual([]);
    expect(modificationFlows(result)).toEqual([]);
  });

  it("keeps the occurrences before the start date", () => {
    // Nominally before the start date, shown after it: kept, since the nominal date decides.
    const occurrences = streamingDates().map((date) =>
      date === "2027-05-05" ? occurrence(date, "2027-06-07") : occurrence(date),
    );
    const result = evaluateScenario(
      subscriptionInput({ items: [streamingItem({ occurrences })] }),
      [change({}, { mode: "none", startDate: "2027-06-05" })],
    );

    expect(itemFlowDates(result)).toEqual([
      "2027-01-05",
      "2027-02-05",
      "2027-03-05",
      "2027-04-05",
      "2027-05-05",
    ]);
  });

  it("removes a moved occurrence by its nominal date", () => {
    // Nominally on the start date, shown two days before it after an override.
    const occurrences = streamingDates().map((date) =>
      date === "2027-01-05" ? occurrence(date, "2027-01-03") : occurrence(date),
    );
    const result = evaluateScenario(
      subscriptionInput({ items: [streamingItem({ occurrences })] }),
      [change({}, { mode: "none" })],
    );

    expect(itemFlowDates(result)).toEqual([]);
  });

  it("monthly on a new subscription adds -999 on day 12 from 2027-02-12", () => {
    const result = evaluateScenario(subscriptionInput(), [
      change(
        { label: "Video streaming" },
        {
          target: { kind: "new", accountId: CHECKING, categoryId: GROCERIES },
          mode: "monthly",
          amount: 999,
          startDate: "2027-02-12",
        },
      ),
    ]);

    expect(result.problems).toEqual([]);
    const flows = modificationFlows(result);
    expect(flows).toHaveLength(22);
    expect(flows.slice(0, 2).map((flow) => flow.date)).toEqual(["2027-02-12", "2027-03-12"]);
    expect(flows.at(-1)?.date).toBe("2028-11-12");
    for (const flow of flows) {
      expect(flow).toMatchObject({ accountId: CHECKING, amount: -999, categoryId: GROCERIES });
    }
    // A new subscription leaves the existing items alone.
    expect(itemFlowDates(result)).toEqual(streamingDates());
  });

  it("monthly from a day 31 falls on the last day of the shorter months", () => {
    const result = evaluateScenario(subscriptionInput(), [
      change({}, { mode: "monthly", amount: 999, startDate: "2027-01-31" }),
    ]);

    const dates = addedFlows(result).map((flow) => flow.date);
    expect(dates.slice(0, 4)).toEqual(["2027-01-31", "2027-02-28", "2027-03-31", "2027-04-30"]);
    expect(dates).toContain("2028-02-29");
  });

  it("yearly from a 29 February falls on 28 February in the other years", () => {
    const result = evaluateScenario(
      subscriptionInput({ range: { from: HORIZON.from, to: "2030-12-31" } }),
      [change({}, { startDate: "2028-02-29" })],
    );

    expect(addedFlows(result).map((flow) => flow.date)).toEqual([
      "2028-02-29",
      "2029-02-28",
      "2030-02-28",
    ]);
  });

  it("a start date after the range end removes nothing and adds nothing", () => {
    const result = evaluateScenario(subscriptionInput(), [change({}, { startDate: "2029-01-05" })]);

    expect(result.problems).toEqual([]);
    expect(itemFlowDates(result)).toEqual(streamingDates());
    expect(modificationFlows(result)).toEqual([]);
  });

  it("a target of kind income is refused as plannedItemKind", () => {
    const salary = streamingItem({ plannedItemId: SALARY_ITEM, kind: "income" });
    const result = evaluateScenario(subscriptionInput({ items: [streamingItem(), salary] }), [
      change({}, { target: { kind: "existing", plannedItemId: SALARY_ITEM } }),
    ]);

    expect(result.problems).toEqual([{ modificationId: 1, reason: "plannedItemKind" }]);
    expect(itemFlowDates(result, SALARY_ITEM)).toEqual(streamingDates());
    expect(modificationFlows(result)).toEqual([]);
  });

  it("a deleted target is reported as plannedItemMissing and applies nothing", () => {
    const result = evaluateScenario(subscriptionInput(), [
      change({}, { target: { kind: "existing", plannedItemId: 404 } }),
    ]);

    expect(result.problems).toEqual([{ modificationId: 1, reason: "plannedItemMissing" }]);
    expect(itemFlowDates(result)).toEqual(streamingDates());
    expect(modificationFlows(result)).toEqual([]);
  });

  it("a start date on or before today is refused as dateNotAfterToday", () => {
    const result = evaluateScenario(subscriptionInput(), [
      change({ id: 1 }, { startDate: TODAY }),
      change({ id: 2, position: 1 }, { mode: "none", startDate: "2026-11-05" }),
    ]);

    expect(result.problems).toEqual([
      { modificationId: 1, reason: "dateNotAfterToday" },
      { modificationId: 2, reason: "dateNotAfterToday" },
    ]);
    expect(itemFlowDates(result)).toEqual(streamingDates());
    expect(modificationFlows(result)).toEqual([]);
  });

  it("a second change on the same target does not remove the flows added by the first", () => {
    const result = evaluateScenario(subscriptionInput(), [
      change({ id: 1, position: 0 }),
      change({ id: 2, position: 1 }, { mode: "monthly", amount: 1499, startDate: "2027-12-20" }),
    ]);

    expect(result.problems).toEqual([]);
    const added = addedFlows(result);
    expect(added.filter((flow) => flow.modificationId === 1)).toEqual([
      { date: "2027-01-05", amount: -12990, modificationId: 1 },
      { date: "2028-01-05", amount: -12990, modificationId: 1 },
    ]);
    expect(added.filter((flow) => flow.modificationId === 2).map((flow) => flow.date)).toEqual([
      "2027-12-20",
      "2028-01-20",
      "2028-02-20",
      "2028-03-20",
      "2028-04-20",
      "2028-05-20",
      "2028-06-20",
      "2028-07-20",
      "2028-08-20",
      "2028-09-20",
      "2028-10-20",
      "2028-11-20",
    ]);
  });

  it("a target on an archived account is refused as accountArchived", () => {
    const onSavings = streamingItem({ accountId: SAVINGS });
    const onMissing = streamingItem({ plannedItemId: SALARY_ITEM, accountId: 404 });
    const result = evaluateScenario(subscriptionInput({ items: [onSavings, onMissing] }), [
      change({ id: 1 }),
      change({ id: 2, position: 1 }, { target: { kind: "existing", plannedItemId: SALARY_ITEM } }),
    ]);

    expect(result.problems).toEqual([
      { modificationId: 1, reason: "accountArchived" },
      { modificationId: 2, reason: "accountMissing" },
    ]);
    expect(itemFlowDates(result)).toEqual(streamingDates());
    expect(modificationFlows(result)).toEqual([]);
  });

  it("a new subscription on an archived account or a missing category is refused", () => {
    const result = evaluateScenario(subscriptionInput(), [
      change({ id: 1 }, { target: { kind: "new", accountId: SAVINGS, categoryId: null } }),
      change(
        { id: 2, position: 1 },
        { target: { kind: "new", accountId: CHECKING, categoryId: MISSING_CATEGORY } },
      ),
    ]);

    expect(result.problems).toEqual([
      { modificationId: 1, reason: "accountArchived" },
      { modificationId: 2, reason: "categoryMissing" },
    ]);
  });

  it("the three variants of journey 4 give the expected flows over 24 months", () => {
    const monthly = evaluateScenario(subscriptionInput(), []);
    const yearly = evaluateScenario(subscriptionInput(), [change()]);
    const none = evaluateScenario(subscriptionInput(), [change({}, { mode: "none" })]);
    const outflow = (result: SimulationResult) =>
      result.flows.reduce((total, flow) => total + flow.amount, 0);

    expect(itemFlowDates(monthly)).toEqual(streamingDates());
    expect(outflow(monthly)).toBe(-23 * STREAMING_AMOUNT);
    expect(itemFlowDates(yearly)).toEqual([]);
    expect(addedFlows(yearly).map((flow) => flow.date)).toEqual(["2027-01-05", "2028-01-05"]);
    expect(outflow(yearly)).toBe(-2 * 12990);
    expect(none.flows).toEqual([]);
    expect(balanceOn(none, HORIZON.to)).toBe(100000);
    expect(balanceOn(yearly, HORIZON.to)).toBe(100000 - 2 * 12990);
    expect(balanceOn(monthly, HORIZON.to)).toBe(100000 - 23 * STREAMING_AMOUNT);
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

describe("subscription change parameters", () => {
  const existing = { kind: "existing", plannedItemId: STREAMING_ITEM };

  it("the schema refuses an amount with none and no amount with monthly", () => {
    for (const value of [
      { target: existing, mode: "monthly", amount: 999, startDate: "2027-02-12" },
      { target: existing, mode: "yearly", amount: 12990, startDate: "2027-01-05" },
      { target: existing, mode: "none", startDate: "2027-01-05" },
      {
        target: { kind: "new", accountId: CHECKING, categoryId: null },
        mode: "monthly",
        amount: 999,
        startDate: "2027-02-12",
      },
    ]) {
      expect(parseModificationParameters("subscription_change", value)).toEqual({
        ok: true,
        parameters: value,
      });
    }
    for (const value of [
      { target: existing, mode: "none", amount: 999, startDate: "2027-01-05" },
      { target: existing, mode: "none", amount: undefined, startDate: "2027-01-05" },
      { target: existing, mode: "monthly", startDate: "2027-02-12" },
      { target: existing, mode: "monthly", amount: 0, startDate: "2027-02-12" },
      { target: existing, mode: "monthly", amount: 9.99, startDate: "2027-02-12" },
      { target: existing, mode: "weekly", amount: 999, startDate: "2027-02-12" },
      { target: existing, mode: "monthly", amount: 999, startDate: "2027-02-30" },
      { target: { kind: "new", accountId: CHECKING }, mode: "none", startDate: "2027-01-05" },
      { target: { kind: "existing" }, mode: "none", startDate: "2027-01-05" },
      { target: { ...existing, accountId: CHECKING }, mode: "none", startDate: "2027-01-05" },
    ]) {
      expect(parseModificationParameters("subscription_change", value)).toEqual({
        ok: false,
        reason: "parametersInvalid",
      });
    }
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
