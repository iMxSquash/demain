import { describe, expect, it } from "vitest";

import type { AccountKind } from "../../src/domain/account";
import type { SavingsGoal } from "../../src/domain/modification";
import { parseModificationParameters } from "../../src/domain/modification-parameters";
import type { ProjectionAccount } from "../../src/domain/projection";
import type { DateRange } from "../../src/domain/recurrence";
import { evaluateScenario, type SimulationInput } from "../../src/domain/simulation";

const TODAY = "2026-12-10";
const CHECKING = 1;
const LIVRET_A = 3;
const LIVRET_JEUNE = 4;
const OTHER_CHECKING = 5;
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
]);

function input(overrides: Partial<SimulationInput> = {}): SimulationInput {
  return {
    accounts: [
      account(),
      account({ id: OTHER_CHECKING, openingBalance: 0 }),
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
    // Given in reverse order and with the larger id first: only the position decides.
    const second = goal({ id: 2, position: 1 }, { mode: monthly(4000, FIRST_TRANSFER) });
    const first = goal({ id: 1, position: 0 }, { mode: monthly(4000, FIRST_TRANSFER) });
    const result = evaluateScenario(input(), [second, first]);

    expect(result.goals.map(({ modificationId }) => modificationId)).toEqual([1, 2]);
    expect(placementsOf(result, 1)).toEqual([
      {
        date: FIRST_TRANSFER,
        placements: [{ accountId: LIVRET_JEUNE, amount: 4000 }],
        unplaced: 0,
      },
    ]);
    expect(placementsOf(result, 2)).toEqual([
      {
        date: FIRST_TRANSFER,
        placements: [
          { accountId: LIVRET_JEUNE, amount: 1000 },
          { accountId: LIVRET_A, amount: 3000 },
        ],
        unplaced: 0,
      },
    ]);
  });

  it("a goal into a checking account is refused as accountKind", () => {
    const result = evaluateScenario(input(), [goal({}, { savingsAccountId: OTHER_CHECKING })]);

    expect(result.problems).toEqual([{ modificationId: 1, reason: "accountKind" }]);
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

  it("a goal in target mode is accepted but applies nothing in this slice", () => {
    const result = evaluateScenario(input(), [
      goal({}, { mode: { kind: "target", targetAmount: 50000, targetDate: "2027-03-15" } }),
    ]);

    expect(result.problems).toEqual([]);
    expect(result.goals).toEqual([]);
    expect(result.simulatedTransfers).toEqual([]);
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
