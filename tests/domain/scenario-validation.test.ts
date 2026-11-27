import { describe, expect, it } from "vitest";

import { loanSchedule } from "../../src/domain/loan";
import type {
  CategoryBudgetChange,
  ChildModification,
  IncomeChange,
  InterestProjection,
  LifeEvent,
  Loan,
  Modification,
  OneOffPurchase,
  SavingsGoal,
  SubscriptionChange,
} from "../../src/domain/modification";
import type { PlannedSchedule, PlannedVersion } from "../../src/domain/occurrences";
import {
  validatePlannedItemInput,
  validatePlannedItemVersion,
} from "../../src/domain/planned-item";
import type { PlannedItemOccurrences, ProjectionAccount } from "../../src/domain/projection";
import { nominalDates } from "../../src/domain/recurrence";
import {
  planScenarioValidation,
  type PlannedItemChange,
  type ValidationContext,
} from "../../src/domain/scenario-validation";
import { evaluateScenario } from "../../src/domain/simulation";

const TODAY = "2026-12-10";
const CHECKING = 1;
const SAVINGS = 2;
const LEISURE = 31;
const LOANS = 32;
// A synthetic "Music streaming" subscription: -1299 every month on day 5.
const STREAMING = 10;
// A synthetic salary whose second version moved it to day 30, next business day.
const SALARY = 20;

function account(id: number, openingBalance: number): ProjectionAccount {
  return {
    id,
    currency: "EUR",
    openingDate: "2026-01-01",
    openingBalance,
    ceiling: null,
    overflowAccountId: null,
    archived: false,
  };
}

function version(overrides: Partial<PlannedVersion>): PlannedVersion {
  return {
    effectiveFrom: "2026-01-05",
    repetition: { kind: "monthly_on_day", day: 5 },
    businessDayRule: "none",
    amount: -1299,
    amountMode: "fixed",
    averageWindow: 3,
    ...overrides,
  };
}

const STREAMING_SCHEDULE: PlannedSchedule = {
  startDate: "2026-01-05",
  endDate: null,
  cancelled: false,
  versions: [version({})],
};

const SALARY_SCHEDULE: PlannedSchedule = {
  startDate: "2026-01-28",
  endDate: null,
  cancelled: false,
  versions: [
    version({
      effectiveFrom: "2026-01-28",
      repetition: { kind: "monthly_on_day", day: 28 },
      businessDayRule: "previous",
      amount: 250000,
    }),
    version({
      effectiveFrom: "2026-09-01",
      repetition: { kind: "monthly_on_day", day: 30 },
      businessDayRule: "next",
      amount: 255000,
    }),
  ],
};

function item(plannedItemId: number, kind: PlannedItemOccurrences["kind"]): PlannedItemOccurrences {
  return { plannedItemId, kind, accountId: CHECKING, destinationAccountId: null, occurrences: [] };
}

function context(overrides: Partial<ValidationContext> = {}): ValidationContext {
  return {
    accounts: [account(CHECKING, 1000000), account(SAVINGS, 0)],
    items: [item(STREAMING, "expense"), item(SALARY, "income")],
    itemCategories: new Map([
      [STREAMING, LEISURE],
      [SALARY, null],
    ]),
    categoryIds: new Set([LEISURE, LOANS]),
    accountKinds: new Map([
      [CHECKING, "checking"],
      [SAVINGS, "savings"],
    ]),
    estimates: {
      lines: [
        {
          accountId: CHECKING,
          categoryId: LEISURE,
          monthlySpending: 28000,
          monthsUsed: 3,
          averageSpending: 28000,
          overridden: false,
        },
      ],
      transactions: [],
    },
    today: TODAY,
    range: { from: TODAY, to: "2027-12-31" },
    schedules: new Map([
      [STREAMING, STREAMING_SCHEDULE],
      [SALARY, SALARY_SCHEDULE],
    ]),
    goalAmounts: new Map(),
    ...overrides,
  };
}

const base = { id: 1, position: 0, label: "Change" };

function subscription(parameters: Partial<SubscriptionChange["parameters"]>): SubscriptionChange {
  return {
    ...base,
    label: "Music streaming yearly",
    type: "subscription_change",
    parameters: {
      target: { kind: "existing", plannedItemId: STREAMING },
      mode: "yearly",
      amount: 12990,
      startDate: "2027-01-05",
      ...parameters,
    },
  };
}

function purchase(
  overrides: Partial<OneOffPurchase> = {},
  parameters: Partial<OneOffPurchase["parameters"]> = {},
): OneOffPurchase {
  return {
    ...base,
    label: "New laptop",
    type: "one_off_purchase",
    parameters: {
      accountId: CHECKING,
      date: "2027-02-10",
      amount: 50000,
      categoryId: LEISURE,
      ...parameters,
    },
    ...overrides,
  };
}

function loan(parameters: Partial<Loan["parameters"]> = {}): Loan {
  return {
    ...base,
    label: "Car loan",
    type: "loan",
    parameters: {
      principal: 100000,
      months: 12,
      annualRateBp: 0,
      receivedOn: "2027-01-31",
      paymentAccountId: CHECKING,
      principalAccountId: CHECKING,
      categoryId: LOANS,
      ...parameters,
    },
  };
}

function incomeChange(parameters: Partial<IncomeChange["parameters"]> = {}): IncomeChange {
  return {
    ...base,
    label: "Raise",
    type: "income_change",
    parameters: {
      target: { kind: "existing", plannedItemId: SALARY },
      change: { kind: "amount", amount: 260000 },
      effectiveDate: "2027-03-01",
      ...parameters,
    },
  };
}

function savingsGoal(mode: SavingsGoal["parameters"]["mode"]): SavingsGoal {
  return {
    ...base,
    label: "Holiday fund",
    type: "savings_goal",
    parameters: {
      sourceAccountId: CHECKING,
      savingsAccountId: SAVINGS,
      firstTransferDate: "2027-01-15",
      mode,
    },
  };
}

function interest(overrides: Partial<InterestProjection> = {}): InterestProjection {
  return {
    ...base,
    label: "Savings interest",
    type: "interest_projection",
    parameters: {
      accountId: SAVINGS,
      annualRateBp: 300,
      frequency: "monthly",
      startDate: "2027-01-01",
    },
    ...overrides,
  };
}

function budgetChange(
  change: CategoryBudgetChange["parameters"]["change"],
  overrides: Partial<CategoryBudgetChange> = {},
): CategoryBudgetChange {
  return {
    ...base,
    label: "Less leisure",
    type: "category_budget_change",
    parameters: { accountId: CHECKING, categoryId: LEISURE, startMonth: "2027-01", change },
    ...overrides,
  };
}

const TARGET_MODE = {
  kind: "target",
  targetAmount: 25000,
  targetDate: "2027-06-30",
} as const satisfies SavingsGoal["parameters"]["mode"];

function plan(modifications: readonly Modification[], overrides: Partial<ValidationContext> = {}) {
  return planScenarioValidation(modifications, context(overrides));
}

describe("planScenarioValidation", () => {
  it("yearly from 2027-01-05 ends the monthly item on 2027-01-04 and creates a yearly item of -12990 from 2027-01-05", () => {
    const result = plan([subscription({})]);

    expect(result).toEqual({
      changes: [
        { kind: "end", modificationId: 1, plannedItemId: STREAMING, endDate: "2027-01-04" },
        {
          kind: "create",
          modificationId: 1,
          input: {
            name: "Music streaming yearly",
            kind: "expense",
            accountId: CHECKING,
            categoryId: LEISURE,
            startDate: "2027-01-05",
            endDate: null,
            repetition: { kind: "yearly" },
            businessDayRule: "none",
            amount: -12990,
            amountMode: "fixed",
          },
          lastOccurrenceAmount: null,
        },
      ],
      notes: [],
      problems: [],
    });
  });

  it("none ends the item and creates nothing", () => {
    const none = subscription({});
    const { target, startDate } = none.parameters;
    // The schema refuses an amount with the mode none.
    const result = plan([{ ...none, parameters: { target, mode: "none", startDate } }]);

    expect(result.changes).toEqual([
      { kind: "end", modificationId: 1, plannedItemId: STREAMING, endDate: "2027-01-04" },
    ]);
    expect(result.problems).toEqual([]);
  });

  it("a monthly change on a new subscription creates it on the day of its start date, without ending anything", () => {
    const result = plan([
      subscription({
        target: { kind: "new", accountId: CHECKING, categoryId: null },
        mode: "monthly",
        amount: 999,
        startDate: "2027-01-20",
      }),
    ]);

    expect(result.changes).toEqual([
      expect.objectContaining({
        kind: "create",
        input: expect.objectContaining({
          accountId: CHECKING,
          categoryId: null,
          repetition: { kind: "monthly_on_day", day: 20 },
          startDate: "2027-01-20",
          amount: -999,
        }),
      }),
    ]);
  });

  it("a change after the item already ended creates the new item without ending it", () => {
    const ended = { ...STREAMING_SCHEDULE, endDate: "2026-12-31" };
    const result = plan([subscription({})], {
      schedules: new Map([[STREAMING, ended]]),
    });

    expect(result.changes.map((change) => change.kind)).toEqual(["create"]);
  });

  it("a one-off purchase becomes a one-off planned expense", () => {
    const result = plan([purchase()]);

    expect(result.changes).toEqual([
      {
        kind: "create",
        modificationId: 1,
        input: {
          name: "New laptop",
          kind: "expense",
          accountId: CHECKING,
          categoryId: LEISURE,
          startDate: "2027-02-10",
          endDate: null,
          repetition: null,
          businessDayRule: "none",
          amount: -50000,
          amountMode: "fixed",
        },
        lastOccurrenceAmount: null,
      },
    ]);
  });

  it("a loan becomes monthly payments with an override on the last one, and a one-off income for the principal", () => {
    const result = plan([loan()]);

    // 100000 over 12 months at 0%: 11 payments of 8333, the last one 8337.
    expect(result.changes).toEqual([
      {
        kind: "create",
        modificationId: 1,
        input: {
          name: "Car loan",
          kind: "expense",
          accountId: CHECKING,
          categoryId: LOANS,
          startDate: "2027-02-28",
          endDate: "2028-01-31",
          repetition: { kind: "monthly_on_day", day: 31 },
          businessDayRule: "none",
          amount: -8333,
          amountMode: "fixed",
        },
        lastOccurrenceAmount: { nominalDate: "2028-01-31", amount: -8337 },
      },
      {
        kind: "create",
        modificationId: 1,
        input: {
          name: "Car loan",
          kind: "income",
          accountId: CHECKING,
          categoryId: null,
          startDate: "2027-01-31",
          endDate: null,
          repetition: null,
          businessDayRule: "none",
          amount: 100000,
          amountMode: "fixed",
        },
        lastOccurrenceAmount: null,
      },
    ]);
  });

  it("the planned payments of a loan fall on the dates of its schedule", () => {
    const [payments] = plan([loan()]).changes;
    if (payments?.kind !== "create") throw new Error("expected a creation");
    const { repetition, startDate, endDate } = payments.input;

    expect(
      nominalDates(repetition, startDate, { from: startDate, to: endDate ?? startDate }),
    ).toEqual(loanSchedule(100000, 12, 0, "2027-01-31").map((payment) => payment.date));
  });

  it("instalments cut by the last supported date end on the last payment, which takes what remains", () => {
    const result = plan([
      loan({ principal: 12000, receivedOn: "9999-06-15", principalAccountId: null }),
    ]);

    // Only 6 payments fit before 9999-12-31: the last one repays the remaining 7000.
    expect(result.changes).toEqual([
      expect.objectContaining({
        input: expect.objectContaining({
          startDate: "9999-07-15",
          endDate: "9999-12-15",
          amount: -1000,
        }),
        lastOccurrenceAmount: { nominalDate: "9999-12-15", amount: -7000 },
      }),
    ]);
  });

  it("a loan whose payments are all equal has no override", () => {
    const [payments] = plan([loan({ principal: 120000 })]).changes;

    expect(payments).toMatchObject({ lastOccurrenceAmount: null, input: { amount: -10000 } });
  });

  it("a raise becomes a version from the effective date with the repetition in effect", () => {
    const result = plan([incomeChange()]);

    expect(result.changes).toEqual([
      {
        kind: "version",
        modificationId: 1,
        plannedItemId: SALARY,
        input: {
          effectiveFrom: "2027-03-01",
          repetition: { kind: "monthly_on_day", day: 30 },
          businessDayRule: "next",
          amount: 260000,
          amountMode: "fixed",
        },
      },
    ]);
  });

  it("an end of income becomes an end date the day before", () => {
    const result = plan([incomeChange({ change: { kind: "end" } })]);

    expect(result.changes).toEqual([
      { kind: "end", modificationId: 1, plannedItemId: SALARY, endDate: "2027-02-28" },
    ]);
  });

  it("a new income becomes a monthly income on the day of its effective date", () => {
    const result = plan([
      incomeChange({ target: { kind: "new", accountId: CHECKING, categoryId: null } }),
    ]);

    expect(result.changes).toEqual([
      expect.objectContaining({
        kind: "create",
        input: expect.objectContaining({
          kind: "income",
          startDate: "2027-03-01",
          repetition: { kind: "monthly_on_day", day: 1 },
          amount: 260000,
        }),
      }),
    ]);
  });

  describe("an existing item that ends before the effective date (owner, 27 Nov 2026, D-C)", () => {
    const ended = new Map([[SALARY, { ...SALARY_SCHEDULE, endDate: "2027-02-15" }]]);

    it("an end changes nothing", () => {
      const result = plan([incomeChange({ change: { kind: "end" } })], { schedules: ended });

      expect(result).toEqual({ changes: [], notes: [], problems: [] });
    });

    it("a raise is the problem plannedItemEnded", () => {
      const result = plan([incomeChange()], { schedules: ended });

      expect(result).toEqual({
        changes: [],
        notes: [],
        problems: [{ modificationId: 1, reason: "plannedItemEnded" }],
      });
    });
  });

  it("a savings goal in target mode becomes a monthly transfer of the computed amount ending on the last transfer date", () => {
    const goal = savingsGoal(TARGET_MODE);
    const { accounts, items, itemCategories, categoryIds, accountKinds, today, range } = context();
    const evaluation = evaluateScenario(
      {
        accounts,
        realFlows: [],
        items,
        itemCategories,
        categoryIds,
        accountKinds,
        estimates: [],
        today,
        range,
      },
      [goal],
    );
    const [outcome] = evaluation.goals;
    if (outcome === undefined) throw new Error("expected a goal outcome");

    const result = plan([goal], {
      goalAmounts: new Map([[goal.id, outcome]]),
    });

    // 25000 in 6 transfers, from 2027-01-15 to 2027-06-15.
    expect(outcome).toMatchObject({ status: "reached", monthlyAmount: 4167 });
    expect(result.changes).toEqual([
      {
        kind: "create",
        modificationId: 1,
        input: {
          name: "Holiday fund",
          kind: "transfer",
          accountId: CHECKING,
          destinationAccountId: SAVINGS,
          categoryId: null,
          startDate: "2027-01-15",
          endDate: "2027-06-15",
          repetition: { kind: "monthly_on_day", day: 15 },
          businessDayRule: "none",
          amount: -4167,
          amountMode: "fixed",
        },
        lastOccurrenceAmount: null,
      },
    ]);
    // The planned transfers fall on the dates of the simulated ones.
    const [created] = result.changes;
    if (created?.kind !== "create") throw new Error("expected a creation");
    const { repetition, startDate, endDate } = created.input;
    expect(
      nominalDates(repetition, startDate, { from: startDate, to: endDate ?? range.to }),
    ).toEqual(outcome.transfers.map((transfer) => transfer.date));
  });

  it("a savings goal in monthly mode keeps its amount and its end date", () => {
    const result = plan([savingsGoal({ kind: "monthly", amount: 5000, endDate: null })]);

    expect(result.changes).toEqual([
      expect.objectContaining({
        input: expect.objectContaining({ kind: "transfer", amount: -5000, endDate: null }),
      }),
    ]);
  });

  it("a goal already reached creates nothing", () => {
    const goal = savingsGoal(TARGET_MODE);
    const result = plan([goal], {
      goalAmounts: new Map([[goal.id, { monthlyAmount: 0, status: "alreadyReached" }]]),
    });

    expect(result).toEqual({ changes: [], notes: [], problems: [] });
  });

  it("an unreachable goal is a problem", () => {
    const goal = savingsGoal(TARGET_MODE);
    const result = plan([goal], {
      goalAmounts: new Map([[goal.id, { monthlyAmount: 0, status: "unreachable" }]]),
    });

    expect(result).toEqual({
      changes: [],
      notes: [],
      problems: [{ modificationId: 1, reason: "goalUnreachable" }],
    });
  });

  it("an invalid modification is a problem and plans nothing", () => {
    const result = plan([purchase({}, { date: TODAY })]);

    expect(result).toEqual({
      changes: [],
      notes: [],
      problems: [{ modificationId: 1, reason: "dateNotAfterToday" }],
    });
  });

  it("interest is listed as not converted", () => {
    const result = plan([interest()]);

    expect(result).toEqual({
      changes: [],
      notes: [{ kind: "interestNotConverted", modificationId: 1 }],
      problems: [],
    });
  });

  it("a category budget change of -2000 basis points on 28000 becomes an override of 22400", () => {
    const result = plan([budgetChange({ kind: "percent", basisPoints: -2000 })]);

    expect(result.notes).toEqual([
      expect.objectContaining({ kind: "estimateOverride", monthlyAmount: 22400 }),
    ]);
  });

  it("an estimate override names its line and its start month (owner, 27 Nov 2026, D-A)", () => {
    const result = plan([budgetChange({ kind: "amount", monthlyAmount: 15000 })]);

    expect(result).toEqual({
      changes: [],
      notes: [
        {
          kind: "estimateOverride",
          modificationId: 1,
          accountId: CHECKING,
          categoryId: LEISURE,
          monthlyAmount: 15000,
          startMonth: "2027-01",
        },
      ],
      problems: [],
    });
  });

  it("two budget changes on the same line keep both overrides in order (owner, 27 Nov 2026, D-B)", () => {
    const result = plan([
      budgetChange({ kind: "amount", monthlyAmount: 30000 }, { id: 2, position: 1 }),
      budgetChange({ kind: "amount", monthlyAmount: 15000 }, { id: 1, position: 0 }),
    ]);

    expect(result.problems).toEqual([]);
    expect(result.notes.map((note) => [note.modificationId, note])).toEqual([
      [1, expect.objectContaining({ monthlyAmount: 15000 })],
      [2, expect.objectContaining({ monthlyAmount: 30000 })],
    ]);
  });

  it("a life event plans its children in order", () => {
    const children: ChildModification[] = [
      purchase({ id: 5, position: 1 }),
      interest({ id: 6, position: 0 }),
      budgetChange({ kind: "amount", monthlyAmount: 0 }, { id: 8, position: 2 }),
    ];
    const lifeEvent: LifeEvent = {
      ...base,
      id: 4,
      label: "Moving out",
      type: "life_event",
      parameters: {},
      children,
    };
    const result = plan([purchase({ id: 7, position: 1 }), lifeEvent]);

    expect(result.problems).toEqual([]);
    expect(result.changes.map((change) => change.modificationId)).toEqual([5, 7]);
    expect(result.notes.map((note) => [note.kind, note.modificationId])).toEqual([
      ["interestNotConverted", 6],
      ["estimateOverride", 8],
    ]);
  });

  it("a second change on the same item does not end it again later", () => {
    const result = plan([
      subscription({}),
      {
        ...subscription({ mode: "monthly", amount: 1499, startDate: "2027-06-01" }),
        id: 2,
        position: 1,
      },
    ]);

    // Ending the item on 2027-05-31 too would bring back its occurrences until then.
    expect(result.changes.map((change) => [change.kind, change.modificationId])).toEqual([
      ["end", 1],
      ["create", 1],
      ["create", 2],
    ]);
  });

  it("a raise after an end of the same income is the problem plannedItemEnded", () => {
    const result = plan([
      incomeChange({ change: { kind: "end" } }),
      { ...incomeChange({ effectiveDate: "2027-06-01" }), id: 2, position: 1 },
    ]);

    expect(result.changes).toEqual([
      { kind: "end", modificationId: 1, plannedItemId: SALARY, endDate: "2027-02-28" },
    ]);
    expect(result.problems).toEqual([{ modificationId: 2, reason: "plannedItemEnded" }]);
  });

  it("a raise passes validatePlannedItemVersion", () => {
    const [change] = plan([incomeChange()]).changes;
    if (change?.kind !== "version") throw new Error("expected a version");

    expect(() =>
      validatePlannedItemVersion(change.input, {
        item: { ...SALARY_SCHEDULE, kind: "income" },
        accountArchived: false,
        settledNominalDates: [],
        overrides: [],
      }),
    ).not.toThrow();
  });

  it("a goal in target mode that the evaluation did not resolve is unreachable", () => {
    const result = plan([savingsGoal(TARGET_MODE)]);

    expect(result.problems).toEqual([{ modificationId: 1, reason: "goalUnreachable" }]);
    expect(result.changes).toEqual([]);
  });

  it("a percentage on a line without estimate becomes an override of 0", () => {
    const result = plan([budgetChange({ kind: "percent", basisPoints: 5000 })], {
      estimates: { lines: [], transactions: [] },
    });

    expect(result.notes).toEqual([expect.objectContaining({ monthlyAmount: 0 })]);
  });

  it("every created input passes validatePlannedItemInput", () => {
    const goal = { ...savingsGoal(TARGET_MODE), id: 6, position: 5 };
    const result = plan(
      [
        subscription({}),
        { ...purchase(), id: 2, position: 1 },
        { ...loan(), id: 3, position: 2 },
        {
          ...loan({ principal: 12000, receivedOn: "9999-06-15", principalAccountId: null }),
          id: 4,
          position: 3,
        },
        {
          ...incomeChange({ target: { kind: "new", accountId: CHECKING, categoryId: null } }),
          id: 5,
          position: 4,
        },
        goal,
        {
          ...savingsGoal({ kind: "monthly", amount: 5000, endDate: "2027-12-15" }),
          id: 7,
          position: 6,
        },
      ],
      { goalAmounts: new Map([[goal.id, { monthlyAmount: 4167, status: "reached" }]]) },
    );
    const created = result.changes.filter(
      (change): change is Extract<PlannedItemChange, { kind: "create" }> =>
        change.kind === "create",
    );
    const ledger = {
      accounts: [
        { id: CHECKING, currency: "EUR", archived: false },
        { id: SAVINGS, currency: "EUR", archived: false },
      ],
      categories: [
        { id: LEISURE, archived: false },
        { id: LOANS, archived: false },
      ],
    };

    expect(result.problems).toEqual([]);
    expect(created).toHaveLength(8);
    for (const { input } of created) {
      expect(() => validatePlannedItemInput(input, ledger)).not.toThrow();
    }
  });
});
