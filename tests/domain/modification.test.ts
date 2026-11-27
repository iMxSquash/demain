import { describe, expect, it } from "vitest";

import {
  applyFlowModifications,
  type CategoryBudgetChange,
  type IncomeChange,
  type Loan,
  type ModificationContext,
  type OneOffPurchase,
  type SubscriptionChange,
} from "../../src/domain/modification";
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
import {
  estimatedFlows,
  type EstimateLine,
  type EstimateTransaction,
} from "../../src/domain/variable-estimate";

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
    const { problems, goals, ...result } = evaluateScenario(input(), []);

    expect(problems).toEqual([]);
    expect(goals).toEqual([]);
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

describe("income change", () => {
  // A synthetic salary: +250000 every month on day 28, from the first one after today.
  const SALARY_AMOUNT = 250000;

  /** Day 28 of each month from 2026-12 to 2028-11: 24 dates, all after today. */
  function salaryDates(): string[] {
    return Array.from({ length: 24 }, (_, index) => {
      const month = index + 11;
      const year = 2026 + Math.floor(month / 12);
      return `${year}-${String((month % 12) + 1).padStart(2, "0")}-28`;
    });
  }

  function salaryOccurrence(
    nominalDate: string,
    overrides: Partial<ResolvedOccurrence> = {},
  ): ResolvedOccurrence {
    return {
      ...occurrence(nominalDate),
      amount: SALARY_AMOUNT,
      expectedAmount: SALARY_AMOUNT,
      remaining: SALARY_AMOUNT,
      ...overrides,
    };
  }

  function salaryItem(occurrences = salaryDates().map((date) => salaryOccurrence(date))) {
    return streamingItem({ plannedItemId: SALARY_ITEM, kind: "income", occurrences });
  }

  function salaryInput(overrides: Partial<SimulationInput> = {}): SimulationInput {
    return subscriptionInput({
      items: [streamingItem(), salaryItem()],
      itemCategories: new Map([
        [STREAMING_ITEM, LEISURE],
        [SALARY_ITEM, null],
      ]),
      ...overrides,
    });
  }

  function incomeChange(
    overrides: Partial<Omit<IncomeChange, "parameters">> = {},
    parameters: Partial<IncomeChange["parameters"]> = {},
  ): IncomeChange {
    return {
      id: 1,
      position: 0,
      label: "Salary",
      type: "income_change",
      parameters: {
        target: { kind: "existing", plannedItemId: SALARY_ITEM },
        change: { kind: "amount", amount: 260000 },
        effectiveDate: "2027-03-01",
        ...parameters,
      },
      ...overrides,
    };
  }

  function salaryFlows(result: SimulationResult): [string, number][] {
    return result.flows.flatMap((flow) =>
      flow.source.kind === "occurrence" && flow.source.plannedItemId === SALARY_ITEM
        ? [[flow.source.nominalDate, flow.amount] as [string, number]]
        : [],
    );
  }

  function changedOccurrences(
    occurrences: ResolvedOccurrence[],
    ...modifications: IncomeChange[]
  ): readonly ResolvedOccurrence[] {
    const context: ModificationContext = {
      ...salaryInput({ items: [salaryItem(occurrences)] }),
      categoryIds: new Set([GROCERIES, LEISURE]),
      accountKinds: new Map(),
      estimates: { lines: [], transactions: [] },
    };
    const { items, problems } = applyFlowModifications(
      { items: [...context.items], flows: [] },
      modifications,
      context,
    );
    expect(problems).toEqual([]);
    return items[0]?.occurrences ?? [];
  }

  it("a new amount of 260000 from 2027-03-01 changes the occurrences from March", () => {
    const result = evaluateScenario(salaryInput(), [incomeChange()]);

    expect(result.problems).toEqual([]);
    expect(salaryFlows(result)).toEqual(
      salaryDates().map((date) => [date, date < "2027-03-01" ? SALARY_AMOUNT : 260000]),
    );
    expect(modificationFlows(result)).toEqual([]);
    // The other items are left alone.
    expect(itemFlowDates(result)).toEqual(streamingDates());
  });

  it("an end from 2027-06-01 removes the occurrences from June", () => {
    const result = evaluateScenario(salaryInput(), [
      incomeChange({}, { change: { kind: "end" }, effectiveDate: "2027-06-01" }),
    ]);

    expect(result.problems).toEqual([]);
    expect(salaryFlows(result)).toEqual(
      ["2026-12-28", "2027-01-28", "2027-02-28", "2027-03-28", "2027-04-28", "2027-05-28"].map(
        (date) => [date, SALARY_AMOUNT],
      ),
    );
    expect(modificationFlows(result)).toEqual([]);
  });

  it("a rolling-average income takes the fixed new amount from the effective date", () => {
    // Estimates that differ from one month to the next, as a rolling average gives them.
    const estimated = salaryDates().map((date, index) =>
      salaryOccurrence(date, { expectedAmount: 240000 + index, remaining: 240000 + index }),
    );
    const result = evaluateScenario(salaryInput({ items: [salaryItem(estimated)] }), [
      incomeChange(),
    ]);

    expect(result.problems).toEqual([]);
    expect(salaryFlows(result)).toEqual(
      salaryDates().map((date, index) => [date, date < "2027-03-01" ? 240000 + index : 260000]),
    );
  });

  it("a new income of 50000 from 2027-02-10 adds a monthly inflow on day 10", () => {
    const result = evaluateScenario(salaryInput(), [
      incomeChange(
        { label: "Second job" },
        {
          target: { kind: "new", accountId: CHECKING, categoryId: GROCERIES },
          change: { kind: "amount", amount: 50000 },
          effectiveDate: "2027-02-10",
        },
      ),
    ]);

    expect(result.problems).toEqual([]);
    const flows = modificationFlows(result);
    expect(flows).toHaveLength(22);
    expect(flows.slice(0, 2).map((flow) => flow.date)).toEqual(["2027-02-10", "2027-03-10"]);
    expect(flows.at(-1)?.date).toBe("2028-11-10");
    for (const flow of flows) {
      expect(flow).toEqual({
        accountId: CHECKING,
        date: flow.date,
        amount: 50000,
        categoryId: GROCERIES,
        external: true,
        source: { kind: "modification", modificationId: 1 },
      });
    }
    // A new income leaves the existing salary alone.
    expect(salaryFlows(result)).toEqual(salaryDates().map((date) => [date, SALARY_AMOUNT]));
  });

  it("an end on a new income is refused by the schema", () => {
    const newTarget = { kind: "new", accountId: CHECKING, categoryId: null } as const;
    const valid = incomeChange().parameters;
    for (const value of [
      valid,
      { ...valid, change: { kind: "end" } },
      { ...valid, target: newTarget },
    ]) {
      expect(parseModificationParameters("income_change", value)).toEqual({
        ok: true,
        parameters: value,
      });
    }
    for (const value of [
      { ...valid, target: newTarget, change: { kind: "end" } },
      { ...valid, change: { kind: "amount", amount: 0 } },
      { ...valid, change: { kind: "amount", amount: 2600.5 } },
      { ...valid, change: { kind: "amount" } },
      { ...valid, change: { kind: "end", amount: 1 } },
      { ...valid, effectiveDate: "2027-02-30" },
      { ...valid, note: "raise" },
    ]) {
      expect(parseModificationParameters("income_change", value)).toEqual({
        ok: false,
        reason: "parametersInvalid",
      });
    }
    const ended = incomeChange({}, { target: newTarget, change: { kind: "end" } });
    expect(evaluateScenario(salaryInput(), [ended]).problems).toEqual([
      { modificationId: 1, reason: "parametersInvalid" },
    ]);
  });

  it("a target of kind expense is refused as plannedItemKind", () => {
    const expense = { kind: "existing", plannedItemId: STREAMING_ITEM } as const;
    const result = evaluateScenario(salaryInput(), [
      incomeChange({ id: 1 }, { target: expense }),
      // The kind is checked before the date.
      incomeChange({ id: 2, position: 1 }, { target: expense, effectiveDate: TODAY }),
    ]);

    expect(result.problems).toEqual([
      { modificationId: 1, reason: "plannedItemKind" },
      { modificationId: 2, reason: "plannedItemKind" },
    ]);
    expect(itemFlowDates(result)).toEqual(streamingDates());
    expect(salaryFlows(result)).toEqual(salaryDates().map((date) => [date, SALARY_AMOUNT]));
  });

  it("an effective date on or before today is refused as dateNotAfterToday", () => {
    const result = evaluateScenario(salaryInput(), [
      incomeChange({ id: 1 }, { effectiveDate: TODAY }),
      incomeChange(
        { id: 2, position: 1 },
        { change: { kind: "end" }, effectiveDate: "2026-11-01" },
      ),
      incomeChange(
        { id: 3, position: 2 },
        { target: { kind: "new", accountId: CHECKING, categoryId: null }, effectiveDate: TODAY },
      ),
    ]);

    expect(result.problems).toEqual(
      [1, 2, 3].map((modificationId) => ({
        modificationId,
        reason: "dateNotAfterToday",
      })),
    );
    expect(salaryFlows(result)).toEqual(salaryDates().map((date) => [date, SALARY_AMOUNT]));
    expect(modificationFlows(result)).toEqual([]);
  });

  it("the nominal date decides, not the date shown after an override", () => {
    // Nominally before the effective date but shown after it, and the other way round.
    const occurrences = [
      salaryOccurrence("2027-02-28", { date: "2027-03-02" }),
      salaryOccurrence("2027-03-28", { date: "2027-02-27" }),
    ];

    expect(
      changedOccurrences(occurrences, incomeChange()).map((occurrence) => occurrence.remaining),
    ).toEqual([SALARY_AMOUNT, 260000]);
    expect(
      changedOccurrences(occurrences, incomeChange({}, { change: { kind: "end" } })).map(
        (occurrence) => occurrence.nominalDate,
      ),
    ).toEqual(["2027-02-28"]);
  });

  it("a planned occurrence whose estimate was 0 takes the new amount", () => {
    const [changed] = changedOccurrences(
      [salaryOccurrence("2027-03-28", { expectedAmount: 0, remaining: 0 })],
      incomeChange(),
    );

    expect([changed?.expectedAmount, changed?.remaining]).toEqual([260000, 260000]);
  });

  it("a settled occurrence keeps 0 remaining", () => {
    // Received early, and a provision whose period passed without any transaction.
    const occurrences = [
      salaryOccurrence("2027-03-28", {
        status: "confirmed",
        linkedSum: SALARY_AMOUNT,
        remaining: 0,
      }),
      salaryOccurrence("2027-04-28", { status: "overdue", remaining: 0 }),
      salaryOccurrence("2027-05-28"),
    ];

    expect(
      changedOccurrences(occurrences, incomeChange()).map(({ expectedAmount, remaining }) => [
        expectedAmount,
        remaining,
      ]),
    ).toEqual([
      [260000, 0],
      [260000, 0],
      [260000, 260000],
    ]);
  });

  it("a partial occurrence keeps only what is not yet received", () => {
    const partial = (linkedSum: number) =>
      salaryOccurrence("2027-03-28", {
        status: "partial",
        linkedSum,
        remaining: SALARY_AMOUNT - linkedSum,
      });

    const [raised] = changedOccurrences([partial(100000)], incomeChange());
    const [lowered] = changedOccurrences(
      [partial(200000)],
      incomeChange({}, { change: { kind: "amount", amount: 150000 } }),
    );

    // A link of the opposite sign does not add to what is still expected.
    const [reversed] = changedOccurrences([partial(-20000)], incomeChange());
    // A second change still sees the partial occurrence, lowered to 0 remaining by the first.
    const [raisedAgain] = changedOccurrences(
      [partial(200000)],
      incomeChange({ id: 1 }, { change: { kind: "amount", amount: 150000 } }),
      incomeChange({ id: 2, position: 1 }, { effectiveDate: "2027-03-15" }),
    );

    expect([raised?.expectedAmount, raised?.remaining]).toEqual([260000, 160000]);
    expect([lowered?.expectedAmount, lowered?.remaining]).toEqual([150000, 0]);
    expect([reversed?.expectedAmount, reversed?.remaining]).toEqual([260000, 260000]);
    expect([raisedAgain?.expectedAmount, raisedAgain?.remaining]).toEqual([260000, 60000]);
  });
});

describe("loan", () => {
  const LOAN_RANGE: DateRange = { from: "2026-12-01", to: "2027-02-28" };
  const RECEIVED_ON = "2026-12-20";

  function loan(
    overrides: Partial<Omit<Loan, "parameters">> = {},
    parameters: Partial<Loan["parameters"]> = {},
  ): Loan {
    return {
      id: 1,
      position: 0,
      label: "Car loan",
      type: "loan",
      parameters: {
        principal: 120000,
        months: 12,
        annualRateBp: 0,
        receivedOn: RECEIVED_ON,
        paymentAccountId: CHECKING,
        principalAccountId: CHECKING,
        categoryId: LEISURE,
        ...parameters,
      },
      ...overrides,
    };
  }

  const loanInput = () => input({ estimates: [], range: LOAN_RANGE });
  const source = { kind: "modification", modificationId: 1 } as const;
  const payment = (date: string) => ({
    accountId: CHECKING,
    date,
    amount: -10000,
    categoryId: LEISURE,
    external: true,
    source,
  });

  it("the principal arrives on the receiving account on the date received", () => {
    const result = evaluateScenario(loanInput(), [loan()]);

    expect(result.problems).toEqual([]);
    expect(modificationFlows(result)).toEqual([
      {
        accountId: CHECKING,
        date: RECEIVED_ON,
        amount: 120000,
        categoryId: null,
        external: true,
        source,
      },
      payment("2027-01-20"),
      payment("2027-02-20"),
    ]);
    expect(balanceOn(result, RECEIVED_ON)).toBe(100000 + 120000);
    expect(balanceOn(result, "2027-02-20")).toBe(100000 + 120000 - 2 * 10000);
  });

  it("no receiving account adds no inflow (instalments)", () => {
    const result = evaluateScenario(loanInput(), [loan({}, { principalAccountId: null })]);

    expect(result.problems).toEqual([]);
    expect(modificationFlows(result)).toEqual([payment("2027-01-20"), payment("2027-02-20")]);
  });

  it("payments after the range end are not added", () => {
    const result = evaluateScenario(loanInput(), [loan({}, { receivedOn: "2027-02-10" })]);

    expect(modificationFlows(result).map((flow) => [flow.date, flow.amount])).toEqual([
      ["2027-02-10", 120000],
    ]);
  });

  it("the principal and the payments go to their own accounts, with the amounts of the schedule", () => {
    const LOAN_ACCOUNT = 3;
    const result = evaluateScenario(
      input({
        estimates: [],
        range: LOAN_RANGE,
        accounts: [account(), account({ id: LOAN_ACCOUNT, openingBalance: 0 })],
      }),
      [loan({}, { principal: 1000000, annualRateBp: 500, principalAccountId: LOAN_ACCOUNT })],
    );

    expect(result.problems).toEqual([]);
    expect(
      modificationFlows(result).map((flow) => [flow.accountId, flow.date, flow.amount]),
    ).toEqual([
      [LOAN_ACCOUNT, RECEIVED_ON, 1000000],
      [CHECKING, "2027-01-20", -85607],
      [CHECKING, "2027-02-20", -85607],
    ]);
  });

  it("a payment of zero adds no flow", () => {
    // 2 over 5 months at a zero rate: four payments of 0, then 2.
    const result = evaluateScenario(
      input({ estimates: [], range: { from: "2026-12-01", to: "2027-05-31" } }),
      [loan({}, { principal: 2, months: 5, principalAccountId: null })],
    );

    expect(modificationFlows(result).map((flow) => [flow.date, flow.amount])).toEqual([
      ["2027-05-20", -2],
    ]);
  });

  it("a loan received today or earlier is reported as dateNotAfterToday", () => {
    const result = evaluateScenario(loanInput(), [
      loan({ id: 1 }, { receivedOn: TODAY }),
      loan({ id: 2, position: 1 }, { receivedOn: "2026-11-15" }),
    ]);

    expect(result.problems).toEqual([
      { modificationId: 1, reason: "dateNotAfterToday" },
      { modificationId: 2, reason: "dateNotAfterToday" },
    ]);
    expect(modificationFlows(result)).toEqual([]);
  });

  it("an archived receiving account or a missing category is refused", () => {
    const result = evaluateScenario(loanInput(), [
      loan({ id: 1 }, { principalAccountId: SAVINGS }),
      loan({ id: 2, position: 1 }, { categoryId: MISSING_CATEGORY }),
      loan({ id: 3, position: 2 }, { paymentAccountId: SAVINGS, principalAccountId: null }),
    ]);

    expect(result.problems).toEqual([
      { modificationId: 1, reason: "accountArchived" },
      { modificationId: 2, reason: "categoryMissing" },
      { modificationId: 3, reason: "accountArchived" },
    ]);
    expect(modificationFlows(result)).toEqual([]);
  });

  it("the schema refuses 0 or 601 months and a rate above 10000", () => {
    const valid = loan().parameters;
    for (const value of [
      valid,
      { ...valid, months: 1 },
      { ...valid, months: 600, annualRateBp: 10000 },
      { ...valid, principalAccountId: null, categoryId: null },
    ]) {
      expect(parseModificationParameters("loan", value)).toEqual({ ok: true, parameters: value });
    }
    for (const value of [
      { ...valid, months: 0 },
      { ...valid, months: 601 },
      { ...valid, months: 12.5 },
      { ...valid, annualRateBp: 10001 },
      { ...valid, annualRateBp: -1 },
      { ...valid, principal: 0 },
      { ...valid, principal: 1200.5 },
      { ...valid, principal: Number.MAX_SAFE_INTEGER },
      { ...valid, receivedOn: "2027-02-30" },
      { ...valid, frequency: "weekly" },
    ]) {
      expect(parseModificationParameters("loan", value)).toEqual({
        ok: false,
        reason: "parametersInvalid",
      });
    }
  });
});

describe("category budget change", () => {
  const BUDGET_RANGE: DateRange = { from: TODAY, to: "2027-03-31" };
  const UNCATEGORIZED = null;

  function line(categoryId: number | null, monthlySpending = 28000): EstimateLine {
    return {
      accountId: CHECKING,
      categoryId,
      monthlySpending,
      monthsUsed: 3,
      averageSpending: monthlySpending,
      overridden: false,
    };
  }

  function budgetInput(
    lines: EstimateLine[] = [line(GROCERIES)],
    transactions: EstimateTransaction[] = [],
  ): SimulationInput {
    return input({
      estimates: estimatedFlows(lines, transactions, BUDGET_RANGE, TODAY),
      estimateInputs: { lines, transactions },
      range: BUDGET_RANGE,
    });
  }

  function budgetChange(
    change: CategoryBudgetChange["parameters"]["change"],
    parameters: Partial<Omit<CategoryBudgetChange["parameters"], "change">> = {},
  ): CategoryBudgetChange {
    return {
      id: 7,
      position: 0,
      label: "Fewer groceries",
      type: "category_budget_change",
      parameters: {
        accountId: CHECKING,
        categoryId: GROCERIES,
        startMonth: "2027-02",
        change,
        ...parameters,
      },
    };
  }

  /** The estimated amounts of one line in one month, by day. */
  function lineAmounts(
    result: SimulationResult,
    month: string,
    categoryId: number | null = GROCERIES,
  ): number[] {
    return result.flows
      .filter(
        (flow) =>
          flow.source.kind === "estimate" &&
          flow.categoryId === categoryId &&
          flow.date.startsWith(month),
      )
      .map((flow) => flow.amount);
  }

  const sum = (amounts: number[]) => amounts.reduce((total, amount) => total + amount, 0);

  it("-2000 basis points from 2027-02 turns 1000 a day into 800 a day in February 2027", () => {
    const result = evaluateScenario(budgetInput(), [
      budgetChange({ kind: "percent", basisPoints: -2000 }),
    ]);

    expect(result.problems).toEqual([]);
    const february = lineAmounts(result, "2027-02");
    expect(february).toEqual(Array.from({ length: 28 }, () => -800));
    expect(sum(february)).toBe(-22400);
    expect(
      result.flows.filter((flow) => flow.date.startsWith("2027-02")).map((flow) => flow.source),
    ).toEqual(Array.from({ length: 28 }, () => ({ kind: "estimate", categoryId: GROCERIES })));
  });

  it("a new monthly amount of 14000 from 2027-02 gives 500 a day", () => {
    const result = evaluateScenario(budgetInput(), [
      budgetChange({ kind: "amount", monthlyAmount: 14000 }),
    ]);

    expect(result.problems).toEqual([]);
    expect(lineAmounts(result, "2027-02")).toEqual(Array.from({ length: 28 }, () => -500));
    expect(lineAmounts(result, "2027-03")).toHaveLength(31);
    expect(sum(lineAmounts(result, "2027-03"))).toBe(-14000);
  });

  it("a change from the current month keeps what was already spent", () => {
    const spent: EstimateTransaction = {
      accountId: CHECKING,
      categoryId: GROCERIES,
      date: "2026-12-04",
      amount: -10000,
      type: "expense",
      linkedToPlannedItem: false,
    };
    const result = evaluateScenario(budgetInput([line(GROCERIES)], [spent]), [
      budgetChange({ kind: "amount", monthlyAmount: 31000 }, { startMonth: "2026-12" }),
    ]);

    expect(result.problems).toEqual([]);
    // 31000 minus the 10000 already spent, over the 22 days from today to 31 December.
    const december = lineAmounts(result, "2026-12");
    expect(december).toHaveLength(22);
    expect(sum(december)).toBe(-21000);
  });

  it("months before the start month are unchanged", () => {
    const before = evaluateConstantPace(budgetInput());
    const result = evaluateScenario(budgetInput(), [
      budgetChange({ kind: "percent", basisPoints: -2000 }),
    ]);

    for (const month of ["2026-12", "2027-01"])
      expect(lineAmounts(result, month)).toEqual(lineAmounts(before, month));
    expect(sum(lineAmounts(result, "2027-01"))).toBe(-28000);
  });

  it("-10000 basis points removes the line from the start month", () => {
    const result = evaluateScenario(budgetInput(), [
      budgetChange({ kind: "percent", basisPoints: -10000 }),
    ]);

    expect(result.problems).toEqual([]);
    expect(lineAmounts(result, "2027-01")).toHaveLength(31);
    expect(lineAmounts(result, "2027-02")).toEqual([]);
    expect(lineAmounts(result, "2027-03")).toEqual([]);
  });

  it("a new amount on a line without estimate creates it", () => {
    const result = evaluateScenario(budgetInput(), [
      budgetChange({ kind: "amount", monthlyAmount: 3100 }, { categoryId: LEISURE }),
    ]);

    expect(result.problems).toEqual([]);
    expect(lineAmounts(result, "2027-01", LEISURE)).toEqual([]);
    expect(lineAmounts(result, "2027-03", LEISURE)).toEqual(Array.from({ length: 31 }, () => -100));
    expect(result.flows.find((flow) => flow.categoryId === LEISURE)?.source).toEqual({
      kind: "estimate",
      categoryId: LEISURE,
    });
    // The Groceries line is left alone.
    expect(sum(lineAmounts(result, "2027-02"))).toBe(-28000);
  });

  it("rounds each scaled flow on its own, ties away from zero", () => {
    const flow = (date: string, amount: number) => ({
      accountId: CHECKING,
      date,
      amount,
      source: { kind: "estimate", categoryId: GROCERIES } as const,
      categoryId: GROCERIES,
      external: true,
    });
    const budgetInputs = budgetInput();
    const context: ModificationContext = {
      ...budgetInputs,
      categoryIds: new Set([GROCERIES]),
      accountKinds: new Map(),
      estimates: { lines: [line(GROCERIES)], transactions: [] },
    };
    const { flows, problems } = applyFlowModifications(
      {
        items: [],
        flows: [flow("2027-02-01", -1001), flow("2027-02-02", -1003), flow("2027-02-03", -999)],
      },
      [budgetChange({ kind: "percent", basisPoints: -5000 })],
      context,
    );

    expect(problems).toEqual([]);
    // Rounding the total instead would give -1502.
    expect(flows.map((scaled) => scaled.amount)).toEqual([-501, -502, -500]);
  });

  it("the uncategorized line is a line like the others", () => {
    const lines = [line(GROCERIES), line(UNCATEGORIZED, 14000)];
    const result = evaluateScenario({ ...budgetInput(lines), categoryIds: new Set() }, [
      budgetChange({ kind: "percent", basisPoints: -5000 }, { categoryId: UNCATEGORIZED }),
    ]);

    expect(result.problems).toEqual([]);
    expect(lineAmounts(result, "2027-02", UNCATEGORIZED)).toEqual(
      Array.from({ length: 28 }, () => -250),
    );
    expect(lineAmounts(result, "2027-01", UNCATEGORIZED)).toHaveLength(31);
    expect(lineAmounts(result, "2027-02")).toEqual(Array.from({ length: 28 }, () => -1000));
  });

  it("a start month before the month of today is reported as dateNotAfterToday", () => {
    const result = evaluateScenario(budgetInput(), [
      budgetChange({ kind: "amount", monthlyAmount: 0 }, { startMonth: "2026-11" }),
    ]);

    expect(result.problems).toEqual([{ modificationId: 7, reason: "dateNotAfterToday" }]);
    expect(result.flows).toEqual(evaluateConstantPace(budgetInput()).flows);
  });

  it("the current month is accepted as start month", () => {
    const result = evaluateScenario(budgetInput(), [
      budgetChange({ kind: "percent", basisPoints: -5000 }, { startMonth: "2026-12" }),
    ]);

    expect(result.problems).toEqual([]);
    // What remains of December, 28000 over 22 days (16 days of 1273, then 6 of 1272), is scaled
    // day by day, -636.5 rounding to -637.
    expect(lineAmounts(result, "2026-12")).toEqual([
      ...Array.from({ length: 16 }, () => -637),
      ...Array.from({ length: 6 }, () => -636),
    ]);
    // Each day of January, 903 or 904, halves to 452: the month is not rounded as a whole.
    expect(sum(lineAmounts(result, "2027-01"))).toBe(-14012);
  });

  it("a missing or archived account and a missing category are reported", () => {
    const result = evaluateScenario(budgetInput(), [
      { ...budgetChange({ kind: "percent", basisPoints: 1000 }, { accountId: 404 }), id: 1 },
      { ...budgetChange({ kind: "percent", basisPoints: 1000 }, { accountId: SAVINGS }), id: 2 },
      {
        ...budgetChange({ kind: "percent", basisPoints: 1000 }, { categoryId: MISSING_CATEGORY }),
        id: 3,
      },
    ]);

    expect(result.problems).toEqual([
      { modificationId: 1, reason: "accountMissing" },
      { modificationId: 2, reason: "accountArchived" },
      { modificationId: 3, reason: "categoryMissing" },
    ]);
  });

  it("the schema refuses out-of-range or decimal basis points, a negative amount, a bad month and an unknown key", () => {
    const valid = {
      accountId: CHECKING,
      categoryId: null,
      startMonth: "2027-02",
      change: { kind: "percent", basisPoints: -10000 },
    };
    for (const value of [
      valid,
      { ...valid, change: { kind: "percent", basisPoints: 100000 } },
      { ...valid, change: { kind: "amount", monthlyAmount: 0 } },
    ]) {
      expect(parseModificationParameters("category_budget_change", value)).toEqual({
        ok: true,
        parameters: value,
      });
    }
    for (const value of [
      { ...valid, change: { kind: "percent", basisPoints: -10001 } },
      { ...valid, change: { kind: "percent", basisPoints: 100001 } },
      { ...valid, change: { kind: "percent", basisPoints: 12.5 } },
      { ...valid, change: { kind: "amount", monthlyAmount: -1 } },
      { ...valid, change: { kind: "amount", monthlyAmount: 100.5 } },
      { ...valid, change: { kind: "amount", basisPoints: 1000 } },
      { ...valid, startMonth: "2027-13" },
      { ...valid, startMonth: "2027-2" },
      { ...valid, startMonth: "2027-02-01" },
      { ...valid, note: "fewer treats" },
      { ...valid, change: { kind: "percent", basisPoints: 1000, note: "x" } },
    ]) {
      expect(parseModificationParameters("category_budget_change", value)).toEqual({
        ok: false,
        reason: "parametersInvalid",
      });
    }
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
    expect(parseModificationParameters("life_event", valid)).toEqual({
      ok: false,
      reason: "parametersInvalid",
    });
    // Stored rows are not trusted: an unknown type or corrupted parameters are reported, never thrown.
    const stored = [
      { ...purchase({ id: 1 }), type: "life_event" },
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
