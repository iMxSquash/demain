import { describe, expect, it } from "vitest";

import type { AccountKind } from "../../src/domain/account";
import { addDays } from "../../src/domain/calendar-date";
import type {
  InterestProjection,
  OneOffPurchase,
  SavingsGoal,
} from "../../src/domain/modification";
import { parseModificationParameters } from "../../src/domain/modification-parameters";
import type { ProjectionAccount } from "../../src/domain/projection";
import type { DateRange } from "../../src/domain/recurrence";
import { evaluateScenario, type SimulationInput } from "../../src/domain/simulation";

const TODAY = "2026-12-10";
const CHECKING = 1;
const SAVINGS = 3;
const RANGE: DateRange = { from: "2026-12-01", to: "2027-12-31" };

function account(overrides: Partial<ProjectionAccount> = {}): ProjectionAccount {
  return {
    id: SAVINGS,
    currency: "EUR",
    openingDate: "2026-01-01",
    openingBalance: 1000000,
    ceiling: null,
    overflowAccountId: null,
    archived: false,
    ...overrides,
  };
}

const ACCOUNT_KINDS: ReadonlyMap<number, AccountKind> = new Map([
  [CHECKING, "checking"],
  [SAVINGS, "savings"],
]);

function input(
  range: Partial<DateRange> = {},
  savings: Partial<ProjectionAccount> = {},
): SimulationInput {
  return {
    accounts: [account({ id: CHECKING, openingBalance: 500000 }), account(savings)],
    realFlows: [],
    items: [],
    itemCategories: new Map(),
    categoryIds: new Set(),
    accountKinds: ACCOUNT_KINDS,
    estimates: [],
    today: TODAY,
    range: { ...RANGE, ...range },
  };
}

function interest(parameters: Partial<InterestProjection["parameters"]> = {}): InterestProjection {
  return {
    id: 1,
    position: 1,
    label: "Livret at 3%",
    type: "interest_projection",
    parameters: {
      accountId: SAVINGS,
      annualRateBp: 300,
      frequency: "monthly",
      startDate: "2027-01-01",
      ...parameters,
    },
  };
}

function balanceOn(
  result: ReturnType<typeof evaluateScenario>,
  date: string,
  accountId = SAVINGS,
): number | undefined {
  return result.days.find((day) => day.date === date)?.balances.get(accountId);
}

/** What the account gained on `date`: the credit, when nothing else moves it that day. */
function gainOn(result: ReturnType<typeof evaluateScenario>, date: string): number {
  return (balanceOn(result, date) ?? 0) - (balanceOn(result, addDays(date, -1)) ?? 0);
}

describe("interest projection", () => {
  it("1000000 at 300 basis points over January 2027 credits 2548 on 2027-01-31", () => {
    const result = evaluateScenario(input({ to: "2027-01-31" }), [interest()]);

    expect(result.problems).toEqual([]);
    expect(balanceOn(result, "2027-01-30")).toBe(1000000);
    expect(gainOn(result, "2027-01-31")).toBe(2548);
  });

  it("1000000 at 300 basis points over 2027 credits 30000 on 2027-12-31", () => {
    const result = evaluateScenario(input(), [interest({ frequency: "yearly" })]);

    expect(balanceOn(result, "2027-12-30")).toBe(1000000);
    expect(gainOn(result, "2027-12-31")).toBe(30000);
  });

  it("a first period starting on 2027-01-16 credits 16 days only", () => {
    const result = evaluateScenario(input({ to: "2027-01-31" }), [
      interest({ startDate: "2027-01-16" }),
    ]);

    expect(gainOn(result, "2027-01-31")).toBe(1315);
  });

  it("a negative day counts as zero", () => {
    const purchase: OneOffPurchase = {
      id: 2,
      position: 0,
      label: "Car",
      type: "one_off_purchase",
      parameters: { accountId: SAVINGS, date: "2027-01-11", amount: 2000000, categoryId: null },
    };
    const result = evaluateScenario(input({ to: "2027-01-31" }), [purchase, interest()]);

    // 10 days at 1000000, then 21 days at -1000000 that count as 0.
    expect(balanceOn(result, "2027-01-30")).toBe(-1000000);
    expect(gainOn(result, "2027-01-31")).toBe(822);
  });

  it("interest is credited on a full capped account", () => {
    const result = evaluateScenario(input({ to: "2027-01-31" }, { ceiling: 1000000 }), [
      interest(),
    ]);

    expect(balanceOn(result, "2027-01-31")).toBe(1002548);
  });

  it("interest sees the transfers of a savings goal of the same day", () => {
    const goal: SavingsGoal = {
      id: 2,
      position: 0,
      label: "Save",
      type: "savings_goal",
      parameters: {
        sourceAccountId: CHECKING,
        savingsAccountId: SAVINGS,
        firstTransferDate: "2027-01-31",
        mode: { kind: "monthly", amount: 20000, endDate: null },
      },
    };
    const result = evaluateScenario(input({ to: "2027-01-31" }), [
      goal,
      interest({ startDate: "2027-01-31" }),
    ]);

    // One day at 1020000 gives 84; before the transfer, it would give 82.
    expect(gainOn(result, "2027-01-31")).toBe(20000 + 84);
  });

  it("the credited interest earns interest the next period", () => {
    const result = evaluateScenario(input({ to: "2027-02-28" }), [interest()]);

    // 28 days at 1002548 give 2307; without the January interest, 2301.
    expect(gainOn(result, "2027-02-28")).toBe(2307);
  });

  it("a period cut by the end of the range is not credited", () => {
    const result = evaluateScenario(input({ to: "2027-02-27" }), [interest()]);

    expect(balanceOn(result, "2027-02-27")).toBe(1002548);
  });

  it("products of large balances do not lose precision", () => {
    const result = evaluateScenario(input({ to: "2028-12-31" }, { openingBalance: 900000000000 }), [
      interest({ frequency: "yearly", startDate: "2028-01-01" }),
    ]);

    // 366 days of the leap year 2028, over a denominator of 365 (D9).
    expect(gainOn(result, "2028-12-31")).toBe(27073972603);
  });

  it("a start date on today is refused with dateNotAfterToday", () => {
    const result = evaluateScenario(input({ to: "2027-01-31" }), [interest({ startDate: TODAY })]);

    expect(result.problems).toEqual([{ modificationId: 1, reason: "dateNotAfterToday" }]);
    expect(balanceOn(result, "2027-01-31")).toBe(1000000);
  });

  it("an account that is not a savings account is refused with accountKind", () => {
    const result = evaluateScenario(input({ to: "2027-01-31" }), [
      interest({ accountId: CHECKING }),
    ]);

    expect(result.problems).toEqual([{ modificationId: 1, reason: "accountKind" }]);
    expect(balanceOn(result, "2027-01-31", CHECKING)).toBe(500000);
  });

  it("a rate above 10000 basis points is refused by the schema", () => {
    const { parameters } = interest({ annualRateBp: 10001 });

    expect(parseModificationParameters("interest_projection", parameters).ok).toBe(false);
    expect(parseModificationParameters("interest_projection", interest().parameters).ok).toBe(true);
  });
});
