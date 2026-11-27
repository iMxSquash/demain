import { describe, expect, it } from "vitest";

import type { AccountKind } from "../../src/domain/account";
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
const LIVRET_A = 3;
const LIVRET_JEUNE = 4;
const OTHER_CHECKING = 5;
const OTHER_KIND = 6;
const RANGE: DateRange = { from: "2026-12-01", to: "2027-03-31" };
const FIRST_TRANSFER = "2026-12-15";

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

// The accounts of the DOMAIN examples (Deposit ceiling and overflow).
function livretJeune(overrides: Partial<ProjectionAccount> = {}): ProjectionAccount {
  return account({
    id: LIVRET_JEUNE,
    openingBalance: 155000,
    ceiling: 160000,
    overflowAccountId: LIVRET_A,
    ...overrides,
  });
}

function livretA(overrides: Partial<ProjectionAccount> = {}): ProjectionAccount {
  return account({ id: LIVRET_A, openingBalance: 0, ceiling: 2295000, ...overrides });
}

const ACCOUNT_KINDS: ReadonlyMap<number, AccountKind> = new Map([
  [CHECKING, "checking"],
  [OTHER_CHECKING, "checking"],
  [LIVRET_A, "savings"],
  [LIVRET_JEUNE, "savings"],
  [OTHER_KIND, "other"],
]);

function input(overrides: Partial<SimulationInput> = {}): SimulationInput {
  return {
    accounts: [
      account(),
      account({ id: OTHER_CHECKING, openingBalance: 0 }),
      account({ id: OTHER_KIND, openingBalance: 0 }),
      livretA(),
      livretJeune(),
    ],
    realFlows: [],
    items: [],
    itemCategories: new Map(),
    categoryIds: new Set(),
    accountKinds: ACCOUNT_KINDS,
    estimates: [],
    today: TODAY,
    range: RANGE,
    ...overrides,
  };
}

function goal(
  overrides: Partial<Omit<SavingsGoal, "parameters">> = {},
  parameters: Partial<SavingsGoal["parameters"]> = {},
): SavingsGoal {
  return {
    id: 1,
    position: 0,
    label: "Save for a trip",
    type: "savings_goal",
    parameters: {
      sourceAccountId: CHECKING,
      savingsAccountId: LIVRET_JEUNE,
      firstTransferDate: FIRST_TRANSFER,
      mode: { kind: "monthly", amount: 20000, endDate: FIRST_TRANSFER },
      ...parameters,
    },
    ...overrides,
  };
}

function monthly(amount: number, endDate: string | null): SavingsGoal["parameters"]["mode"] {
  return { kind: "monthly", amount, endDate };
}

function balanceOn(
  result: ReturnType<typeof evaluateScenario>,
  accountId: number,
  date: string,
): number | undefined {
  return result.days.find((day) => day.date === date)?.balances.get(accountId);
}

function placementsOf(result: ReturnType<typeof evaluateScenario>, modificationId = 1) {
  return result.goals
    .find((outcome) => outcome.modificationId === modificationId)
    ?.transfers.map(({ date, routing }) =>
      routing.status === "ok"
        ? { date, placements: routing.placements, unplaced: routing.unplaced }
        : { date, invalid: routing.reason },
    );
}

describe("savings goal with a monthly amount", () => {
  it("a monthly 20000 into a Livret Jeune at 155000 sends 5000 to it and 15000 to the Livret A", () => {
    const result = evaluateScenario(input(), [goal()]);

    expect(result.problems).toEqual([]);
    expect(placementsOf(result)).toEqual([
      {
        date: FIRST_TRANSFER,
        placements: [
          { accountId: LIVRET_JEUNE, amount: 5000 },
          { accountId: LIVRET_A, amount: 15000 },
        ],
        unplaced: 0,
      },
    ]);
    expect(balanceOn(result, CHECKING, FIRST_TRANSFER)).toBe(80000);
    expect(balanceOn(result, LIVRET_JEUNE, FIRST_TRANSFER)).toBe(160000);
    expect(balanceOn(result, LIVRET_A, FIRST_TRANSFER)).toBe(15000);
    // The legs of a transfer between the user's accounts are not flows to or from outside.
    expect(result.flows).toEqual([]);
  });

  it("with the Livret A at 2290000, it sends 5000, 5000 and leaves 10000 unplaced in checking", () => {
    const accounts = [account(), livretA({ openingBalance: 2290000 }), livretJeune()];
    const result = evaluateScenario(input({ accounts }), [goal()]);

    expect(placementsOf(result)).toEqual([
      {
        date: FIRST_TRANSFER,
        placements: [
          { accountId: LIVRET_JEUNE, amount: 5000 },
          { accountId: LIVRET_A, amount: 5000 },
        ],
        unplaced: 10000,
      },
    ]);
    expect(result.goals[0]?.unplacedTotal).toBe(10000);
    expect(balanceOn(result, CHECKING, FIRST_TRANSFER)).toBe(90000);
  });

  it("the transfers repeat on the day of the first transfer until the end date", () => {
    const result = evaluateScenario(input(), [
      goal(
        {},
        {
          savingsAccountId: LIVRET_A,
          firstTransferDate: "2027-01-31",
          mode: monthly(10000, "2027-03-30"),
        },
      ),
    ]);

    // A day past the end of the month falls on its last day; 31 March is after the end date.
    expect(result.goals[0]?.transfers.map(({ date }) => date)).toEqual([
      "2027-01-31",
      "2027-02-28",
    ]);
    expect(balanceOn(result, LIVRET_A, "2027-03-31")).toBe(20000);
  });

  it("an end date on the day of a transfer includes it", () => {
    const result = evaluateScenario(input(), [
      goal({}, { savingsAccountId: LIVRET_A, mode: monthly(10000, "2027-01-15") }),
    ]);

    expect(result.goals[0]?.transfers.map(({ date }) => date)).toEqual([
      "2026-12-15",
      "2027-01-15",
    ]);
  });

  it("without end date the transfers run to the end of the range", () => {
    const result = evaluateScenario(input(), [
      goal({}, { savingsAccountId: LIVRET_A, mode: monthly(10000, null) }),
    ]);

    expect(result.goals[0]?.transfers.map(({ date }) => date)).toEqual([
      "2026-12-15",
      "2027-01-15",
      "2027-02-15",
      "2027-03-15",
    ]);
    expect(balanceOn(result, CHECKING, "2027-03-31")).toBe(60000);
  });

  it("the transfers before the start of the range are not generated", () => {
    const range = { from: "2027-01-01", to: "2027-02-28" };
    const result = evaluateScenario(input({ range }), [
      goal({}, { savingsAccountId: LIVRET_A, mode: monthly(10000, null) }),
    ]);

    expect(result.goals[0]?.transfers.map(({ date }) => date)).toEqual([
      "2027-01-15",
      "2027-02-15",
    ]);
    expect(balanceOn(result, CHECKING, "2027-02-28")).toBe(80000);
  });

  it("the first month fits and the next one splits", () => {
    const result = evaluateScenario(input(), [goal({}, { mode: monthly(3000, "2027-01-15") })]);

    expect(placementsOf(result)).toEqual([
      {
        date: "2026-12-15",
        placements: [{ accountId: LIVRET_JEUNE, amount: 3000 }],
        unplaced: 0,
      },
      {
        date: "2027-01-15",
        placements: [
          { accountId: LIVRET_JEUNE, amount: 2000 },
          { accountId: LIVRET_A, amount: 1000 },
        ],
        unplaced: 0,
      },
    ]);
  });

  it("two goals on the same day are routed by position", () => {
    // Given out of order, the lower position with the larger id: the position decides, then the id.
    const last = goal({ id: 3, position: 1 }, { mode: monthly(2000, FIRST_TRANSFER) });
    const tied = goal({ id: 1, position: 1 }, { mode: monthly(2000, FIRST_TRANSFER) });
    const first = goal({ id: 2, position: 0 }, { mode: monthly(2000, FIRST_TRANSFER) });
    const result = evaluateScenario(input(), [last, tied, first]);

    expect(result.goals.map(({ modificationId }) => modificationId)).toEqual([2, 1, 3]);
    expect(result.simulatedTransfers.map(({ source }) => source)).toEqual(
      [2, 1, 3].map((modificationId) => ({ kind: "modification", modificationId })),
    );
    expect([2, 1, 3].map((id) => placementsOf(result, id)?.[0]?.placements)).toEqual([
      [{ accountId: LIVRET_JEUNE, amount: 2000 }],
      [{ accountId: LIVRET_JEUNE, amount: 2000 }],
      [
        { accountId: LIVRET_JEUNE, amount: 1000 },
        { accountId: LIVRET_A, amount: 1000 },
      ],
    ]);
  });

  it("a flow of stage A on the same day applies before the goal", () => {
    const withdrawal: OneOffPurchase = {
      id: 9,
      position: 5,
      label: "Withdrawal",
      type: "one_off_purchase",
      parameters: { accountId: LIVRET_JEUNE, date: FIRST_TRANSFER, amount: 3000, categoryId: null },
    };
    const result = evaluateScenario(input(), [goal(), withdrawal]);

    // The withdrawal frees 3000 of room before the transfer is routed, whatever the positions.
    expect(placementsOf(result)).toEqual([
      {
        date: FIRST_TRANSFER,
        placements: [
          { accountId: LIVRET_JEUNE, amount: 8000 },
          { accountId: LIVRET_A, amount: 12000 },
        ],
        unplaced: 0,
      },
    ]);
    expect(result.flows.map(({ source }) => source)).toEqual([
      { kind: "modification", modificationId: 9 },
    ]);
  });

  it("a goal into a checking account is refused as accountKind", () => {
    const result = evaluateScenario(input(), [
      goal({ id: 1 }, { savingsAccountId: OTHER_CHECKING }),
      goal({ id: 2 }, { savingsAccountId: OTHER_KIND }),
    ]);

    expect(result.problems).toEqual([
      { modificationId: 1, reason: "accountKind" },
      { modificationId: 2, reason: "accountKind" },
    ]);
    expect(result.simulatedTransfers).toEqual([]);
    expect(balanceOn(result, CHECKING, "2027-03-31")).toBe(100000);
  });

  it("without account kinds every goal is refused as accountKind", () => {
    const result = evaluateScenario(input({ accountKinds: undefined }), [goal()]);

    expect(result.problems).toEqual([{ modificationId: 1, reason: "accountKind" }]);
  });

  it("a missing or archived account is refused through its reference", () => {
    const missing = goal({ id: 1 }, { savingsAccountId: 99 });
    const archivedSource = goal({ id: 2 }, { sourceAccountId: OTHER_CHECKING });
    const accounts = [
      account(),
      account({ id: OTHER_CHECKING, archived: true }),
      livretA(),
      livretJeune(),
    ];
    const result = evaluateScenario(input({ accounts }), [missing, archivedSource]);

    expect(result.problems).toEqual([
      { modificationId: 1, reason: "accountMissing" },
      { modificationId: 2, reason: "accountArchived" },
    ]);
  });

  it("a first transfer on or before today is refused as dateNotAfterToday", () => {
    const result = evaluateScenario(input(), [goal({}, { firstTransferDate: TODAY })]);

    expect(result.problems).toEqual([{ modificationId: 1, reason: "dateNotAfterToday" }]);
  });

  it("a cycle in stored data makes each transfer invalid, places nothing and terminates", () => {
    const accounts = [
      account(),
      livretA({ overflowAccountId: LIVRET_JEUNE }),
      livretJeune({ overflowAccountId: LIVRET_A }),
    ];
    const result = evaluateScenario(input({ accounts }), [
      goal({}, { mode: monthly(20000, null) }),
    ]);

    expect(placementsOf(result)).toEqual(
      ["2026-12-15", "2027-01-15", "2027-02-15", "2027-03-15"].map((date) => ({
        date,
        invalid: "cycle",
      })),
    );
    // The money stays in the source account (owner, D3).
    expect(result.goals[0]?.unplacedTotal).toBe(80000);
    expect(balanceOn(result, CHECKING, "2027-03-31")).toBe(100000);
    expect(balanceOn(result, LIVRET_JEUNE, "2027-03-31")).toBe(155000);
  });

  it("the unplaced total adds the unplaced part of every transfer", () => {
    const accounts = [account(), livretA({ openingBalance: 2290000 }), livretJeune()];
    const result = evaluateScenario(input({ accounts }), [
      goal({}, { mode: monthly(20000, "2027-01-15") }),
    ]);

    // December leaves 10000 unplaced, January finds no room at all.
    expect(result.goals[0]?.unplacedTotal).toBe(30000);
    expect(balanceOn(result, CHECKING, "2027-01-15")).toBe(90000);
  });

  it("the source account may go below zero", () => {
    const accounts = [account({ openingBalance: 10000 }), livretA(), livretJeune()];
    const result = evaluateScenario(input({ accounts }), [
      goal({}, { savingsAccountId: LIVRET_A }),
    ]);

    expect(balanceOn(result, CHECKING, FIRST_TRANSFER)).toBe(-10000);
    expect(balanceOn(result, LIVRET_A, FIRST_TRANSFER)).toBe(20000);
  });

  it("a valid monthly goal is reported as applied with its monthly amount", () => {
    const result = evaluateScenario(input(), [goal()]);

    expect(result.goals).toEqual([
      {
        modificationId: 1,
        monthlyAmount: 20000,
        transfers: result.simulatedTransfers,
        unplacedTotal: 0,
        status: "applied",
      },
    ]);
    expect(result.simulatedTransfers).toHaveLength(1);
    expect(result.simulatedTransfers[0]?.source).toEqual({
      kind: "modification",
      modificationId: 1,
    });
  });

  it("an invalid goal is absent from the goals and moves nothing", () => {
    const result = evaluateScenario(input(), [
      goal({}, { firstTransferDate: TODAY, mode: monthly(20000, null) }),
    ]);

    expect(result.problems).toEqual([{ modificationId: 1, reason: "dateNotAfterToday" }]);
    expect(result.goals).toEqual([]);
    expect(result.simulatedTransfers).toEqual([]);
    expect(balanceOn(result, CHECKING, "2027-03-31")).toBe(100000);
  });
});

describe("savings goal in target mode (inverse)", () => {
  const YEAR: DateRange = { from: "2026-12-01", to: "2027-12-31" };
  const FIRST = "2027-01-15";

  function inverseGoal(
    targetAmount: number,
    targetDate: string,
    parameters: Partial<SavingsGoal["parameters"]> = {},
    overrides: Partial<Omit<SavingsGoal, "parameters">> = {},
  ): SavingsGoal {
    return goal(overrides, {
      savingsAccountId: LIVRET_A,
      firstTransferDate: FIRST,
      mode: { kind: "target", targetAmount, targetDate },
      ...parameters,
    });
  }

  function outcomeOf(result: ReturnType<typeof evaluateScenario>, modificationId = 1) {
    return result.goals.find((outcome) => outcome.modificationId === modificationId);
  }

  function chainTotalOn(
    result: ReturnType<typeof evaluateScenario>,
    accountIds: readonly number[],
    date: string,
  ): number {
    return accountIds.reduce((total, id) => total + (balanceOn(result, id, date) ?? 0), 0);
  }

  const unreachableAccounts = () => [
    account(),
    livretA({ openingBalance: 2290000 }),
    livretJeune({ openingBalance: 150000 }),
  ];

  it("12 transfers from 2027-01-15 reach 120000 by 2027-12-15 with 10000 a month", () => {
    const accounts = [account(), livretA({ ceiling: null })];
    const result = evaluateScenario(input({ accounts, range: YEAR }), [
      inverseGoal(120000, "2027-12-15"),
    ]);

    expect(result.problems).toEqual([]);
    expect(outcomeOf(result)?.status).toBe("reached");
    expect(outcomeOf(result)?.monthlyAmount).toBe(10000);
    expect(outcomeOf(result)?.transfers.map(({ date }) => date)).toEqual(
      Array.from({ length: 12 }, (_, index) => `2027-${String(index + 1).padStart(2, "0")}-15`),
    );
    expect(balanceOn(result, LIVRET_A, "2027-12-15")).toBe(120000);
  });

  it("rounds up: 100000 over 3 transfers needs 33334", () => {
    const accounts = [account(), livretA({ ceiling: null })];
    const result = evaluateScenario(input({ accounts }), [inverseGoal(100000, "2027-03-15")]);

    expect(outcomeOf(result)?.monthlyAmount).toBe(33334);
    expect(balanceOn(result, LIVRET_A, "2027-03-15")).toBe(100002);
  });

  it("follows the chain: a Livret Jeune at 150000 (ceiling 160000) overflowing to a Livret A reaches a chain total of 300000 with 3 transfers of 50000", () => {
    const accounts = [account(), livretA(), livretJeune({ openingBalance: 150000 })];
    const result = evaluateScenario(input({ accounts }), [
      inverseGoal(300000, "2027-03-15", { savingsAccountId: LIVRET_JEUNE }),
    ]);

    expect(outcomeOf(result)?.monthlyAmount).toBe(50000);
    expect(placementsOf(result)).toEqual([
      {
        date: "2027-01-15",
        placements: [
          { accountId: LIVRET_JEUNE, amount: 10000 },
          { accountId: LIVRET_A, amount: 40000 },
        ],
        unplaced: 0,
      },
      { date: "2027-02-15", placements: [{ accountId: LIVRET_A, amount: 50000 }], unplaced: 0 },
      { date: "2027-03-15", placements: [{ accountId: LIVRET_A, amount: 50000 }], unplaced: 0 },
    ]);
    expect(chainTotalOn(result, [LIVRET_JEUNE, LIVRET_A], "2027-03-15")).toBe(300000);
  });

  it("already reached gives 0 and no transfer", () => {
    const accounts = [account(), livretA({ openingBalance: 200000 })];
    const result = evaluateScenario(input({ accounts }), [inverseGoal(150000, "2027-03-15")]);

    expect(result.problems).toEqual([]);
    expect(result.goals).toEqual([
      {
        modificationId: 1,
        monthlyAmount: 0,
        transfers: [],
        unplacedTotal: 0,
        status: "alreadyReached",
      },
    ]);
    expect(result.simulatedTransfers).toEqual([]);
    expect(balanceOn(result, CHECKING, "2027-03-31")).toBe(100000);
  });

  it("a chain whose ceilings stay below the target is unreachable and applies nothing", () => {
    const result = evaluateScenario(input({ accounts: unreachableAccounts() }), [
      inverseGoal(3000000, "2027-03-15", { savingsAccountId: LIVRET_JEUNE }),
    ]);

    expect(result.problems).toEqual([{ modificationId: 1, reason: "goalUnreachable" }]);
    expect(outcomeOf(result)?.status).toBe("unreachable");
    expect(result.simulatedTransfers).toEqual([]);
    expect(balanceOn(result, CHECKING, "2027-03-31")).toBe(100000);
    expect(balanceOn(result, LIVRET_JEUNE, "2027-03-31")).toBe(150000);
  });

  it("an unreachable goal reports a monthly amount of 0, no transfer and nothing unplaced", () => {
    const result = evaluateScenario(input({ accounts: unreachableAccounts() }), [
      inverseGoal(3000000, "2027-03-15", { savingsAccountId: LIVRET_JEUNE }),
    ]);

    expect(result.goals).toEqual([
      {
        modificationId: 1,
        monthlyAmount: 0,
        transfers: [],
        unplacedTotal: 0,
        status: "unreachable",
      },
    ]);
  });

  it("a cycle in the overflow chain makes the goal unreachable, even when the target looks reached", () => {
    const accounts = [
      account(),
      livretA({ overflowAccountId: LIVRET_JEUNE }),
      livretJeune({ overflowAccountId: LIVRET_A }),
    ];
    const result = evaluateScenario(input({ accounts }), [
      inverseGoal(1, "2027-03-15", { savingsAccountId: LIVRET_JEUNE }),
    ]);

    expect(result.problems).toEqual([{ modificationId: 1, reason: "goalUnreachable" }]);
    expect(outcomeOf(result)?.status).toBe("unreachable");
    expect(result.simulatedTransfers).toEqual([]);
  });

  it("a target date after the end of the range extends the search, and only the transfers of the range are returned", () => {
    const accounts = [account(), livretA({ ceiling: null })];
    const result = evaluateScenario(input({ accounts }), [inverseGoal(120000, "2027-12-15")]);

    expect(outcomeOf(result)?.status).toBe("reached");
    expect(outcomeOf(result)?.monthlyAmount).toBe(10000);
    expect(outcomeOf(result)?.transfers.map(({ date }) => date)).toEqual([
      "2027-01-15",
      "2027-02-15",
      "2027-03-15",
    ]);
    expect(result.days.at(-1)?.date).toBe(RANGE.to);
  });

  it("the search past the range sees the flows of stage A after the range", () => {
    const accounts = [account(), livretA({ ceiling: null })];
    const purchase: OneOffPurchase = {
      id: 2,
      position: 0,
      label: "Withdrawal",
      type: "one_off_purchase",
      parameters: { accountId: LIVRET_A, date: "2027-06-01", amount: 50000, categoryId: null },
    };
    const result = evaluateScenario(input({ accounts }), [
      purchase,
      inverseGoal(120000, "2027-12-15", {}, { position: 1 }),
    ]);

    // 12 transfers must cover 120000 plus the 50000 withdrawn: 170000 / 12, rounded up.
    expect(outcomeOf(result)?.monthlyAmount).toBe(14167);
  });

  it("a goal inside the range and a goal past it are resolved in turn", () => {
    const accounts = [account(), livretA({ ceiling: null })];
    const result = evaluateScenario(input({ accounts }), [
      inverseGoal(30000, "2027-03-15"),
      inverseGoal(120000, "2027-12-15", {}, { id: 2, position: 1 }),
    ]);

    // The first goal brings 30000 by March, the second 90000 over 12 transfers.
    expect(outcomeOf(result)?.monthlyAmount).toBe(10000);
    expect(outcomeOf(result, 2)?.monthlyAmount).toBe(7500);
  });

  it("a resolved goal is taken into account by the next one", () => {
    const accounts = [account(), livretA({ ceiling: null })];
    const result = evaluateScenario(input({ accounts }), [
      inverseGoal(90000, "2027-03-15", {}, { id: 2, position: 1 }),
      inverseGoal(60000, "2027-03-15"),
    ]);

    expect(
      result.goals.map(({ modificationId, monthlyAmount, status }) => ({
        modificationId,
        monthlyAmount,
        status,
      })),
    ).toEqual([
      { modificationId: 1, monthlyAmount: 20000, status: "reached" },
      { modificationId: 2, monthlyAmount: 10000, status: "reached" },
    ]);
    expect(balanceOn(result, LIVRET_A, "2027-03-15")).toBe(90000);
  });

  it("the goals after a target goal are left out of its resolution", () => {
    const accounts = [account(), livretA({ ceiling: null })];
    const later = goal(
      { id: 2, position: 1 },
      { savingsAccountId: LIVRET_A, firstTransferDate: FIRST, mode: monthly(50000, null) },
    );
    const result = evaluateScenario(input({ accounts }), [inverseGoal(30000, "2027-03-15"), later]);

    expect(outcomeOf(result)?.monthlyAmount).toBe(10000);
    expect(outcomeOf(result, 2)?.status).toBe("applied");
  });

  it("an interest projection placed before the goal lowers the amount needed", () => {
    const accounts = [account(), livretA({ openingBalance: 1000000, ceiling: null })];
    const interest: InterestProjection = {
      id: 2,
      position: 0,
      label: "Livret A interest",
      type: "interest_projection",
      parameters: {
        accountId: LIVRET_A,
        annualRateBp: 300,
        frequency: "monthly",
        startDate: "2027-01-01",
      },
    };
    const target = inverseGoal(1300000, "2027-03-31", {}, { position: 1 });

    const without = evaluateScenario(input({ accounts }), [target]);
    const withInterest = evaluateScenario(input({ accounts }), [interest, target]);

    const found = outcomeOf(withInterest)?.monthlyAmount ?? 0;
    const balanceWith = (amount: number) =>
      balanceOn(
        evaluateScenario(input({ accounts }), [
          interest,
          goal(
            { position: 1 },
            {
              savingsAccountId: LIVRET_A,
              firstTransferDate: FIRST,
              mode: monthly(amount, "2027-03-31"),
            },
          ),
        ]),
        LIVRET_A,
        "2027-03-31",
      ) ?? 0;

    expect(outcomeOf(without)?.monthlyAmount).toBe(100000);
    expect(found).toBeLessThan(100000);
    expect(balanceWith(found)).toBeGreaterThanOrEqual(1300000);
    expect(balanceWith(found - 1)).toBeLessThan(1300000);
  });

  it("a reached goal reports the surplus that fits nowhere", () => {
    const accounts = [account(), livretA({ ceiling: 100000 })];
    const result = evaluateScenario(input({ accounts }), [inverseGoal(100000, "2027-03-15")]);

    expect(outcomeOf(result)).toMatchObject({
      monthlyAmount: 33334,
      unplacedTotal: 2,
      status: "reached",
    });
    expect(balanceOn(result, LIVRET_A, "2027-03-15")).toBe(100000);
  });

  it("the amount found reaches the target and the amount minus one does not", () => {
    const cases = [
      {
        accounts: [account(), livretA({ ceiling: null })],
        chain: [LIVRET_A],
        parameters: { savingsAccountId: LIVRET_A, firstTransferDate: FIRST },
        targetAmount: 100000,
        targetDate: "2027-03-15",
      },
      {
        accounts: [account(), livretA(), livretJeune({ openingBalance: 150000 })],
        chain: [LIVRET_JEUNE, LIVRET_A],
        parameters: { savingsAccountId: LIVRET_JEUNE, firstTransferDate: FIRST },
        targetAmount: 300001,
        targetDate: "2027-06-15",
      },
      {
        accounts: [account(), livretA({ openingBalance: 12345, ceiling: null })],
        chain: [LIVRET_A],
        parameters: { savingsAccountId: LIVRET_A, firstTransferDate: "2027-01-31" },
        targetAmount: 777777,
        targetDate: "2027-11-20",
      },
      {
        accounts: [account(), livretA({ ceiling: 250000 }), livretJeune({ openingBalance: 0 })],
        chain: [LIVRET_JEUNE, LIVRET_A],
        parameters: { savingsAccountId: LIVRET_JEUNE, firstTransferDate: FIRST },
        targetAmount: 400000,
        targetDate: "2027-12-15",
      },
    ];
    for (const { accounts, chain, parameters, targetAmount, targetDate } of cases) {
      const simulation = input({ accounts, range: YEAR });
      const found = outcomeOf(
        evaluateScenario(simulation, [inverseGoal(targetAmount, targetDate, parameters)]),
      )?.monthlyAmount;
      expect(found).toBeGreaterThan(1);
      const totalWith = (amount: number) =>
        chainTotalOn(
          evaluateScenario(simulation, [
            goal({}, { ...parameters, mode: monthly(amount, targetDate) }),
          ]),
          chain,
          targetDate,
        );

      expect(totalWith(found!)).toBeGreaterThanOrEqual(targetAmount);
      expect(totalWith(found! - 1)).toBeLessThan(targetAmount);
    }
  });
});

describe("savings goal parameters", () => {
  const valid = goal().parameters;

  it("accepts a monthly amount with or without end date, and a target", () => {
    const accepted = [
      valid,
      { ...valid, mode: monthly(1, null) },
      { ...valid, mode: { kind: "target", targetAmount: 1, targetDate: FIRST_TRANSFER } },
    ];
    for (const value of accepted) {
      expect(parseModificationParameters("savings_goal", value)).toEqual({
        ok: true,
        parameters: value,
      });
    }
  });

  it("refuses amounts that are not positive integers, dates out of order and a single account", () => {
    const refused = [
      { ...valid, mode: monthly(0, null) },
      { ...valid, mode: monthly(-100, null) },
      { ...valid, mode: monthly(10.5, null) },
      { ...valid, mode: monthly(100, "2026-12-14") },
      { ...valid, mode: { kind: "target", targetAmount: 0, targetDate: "2027-01-01" } },
      { ...valid, mode: { kind: "target", targetAmount: 100, targetDate: "2026-12-14" } },
      { ...valid, savingsAccountId: CHECKING },
      { ...valid, firstTransferDate: "2026-02-30" },
      { ...valid, mode: { kind: "monthly", amount: 100 } },
      { ...valid, extra: true },
    ];
    for (const value of refused) {
      expect(parseModificationParameters("savings_goal", value)).toEqual({
        ok: false,
        reason: "parametersInvalid",
      });
    }
  });
});
