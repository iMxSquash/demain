import { describe, expect, it } from "vitest";

import {
  choicesForShortfalls,
  overflowTargetChoices,
  overflowDemands,
  withOverflowChoice,
  type PendingOverflow,
} from "../../src/domain/import-overflow";
import { planSavingsTransfers, type SavingsAccountChoice } from "../../src/domain/import-savings";
import type { OverflowAccount } from "../../src/domain/overflow";

const account = (overrides: Partial<OverflowAccount> & { id: number | string }): OverflowAccount => ({
  currency: "EUR",
  archived: false,
  balance: 0,
  ceiling: null,
  overflowAccountId: null,
  ...overrides,
});

describe("overflowDemands", () => {
  it("asks nothing when no row falls short", () => {
    expect(overflowDemands([[], []])).toEqual([]);
  });

  it("adds up what does not fit in one account, across rows and files", () => {
    expect(
      overflowDemands([
        [{ accountId: 2, amount: 5_000 }, { accountId: 2, amount: 1_000 }],
        [{ accountId: 2, amount: 500 }],
      ]),
    ).toEqual([{ accountId: 2, amount: 6_500, rows: 3 }]);
  });

  it("asks once per account, in the order the accounts first fall short", () => {
    expect(
      overflowDemands([
        [{ accountId: 4, amount: 100 }],
        [{ accountId: 2, amount: 200 }, { accountId: 4, amount: 300 }],
      ]),
    ).toEqual([
      { accountId: 4, amount: 400, rows: 2 },
      { accountId: 2, amount: 200, rows: 1 },
    ]);
  });
});

describe("choicesForShortfalls", () => {
  const existing = (accountId: number): PendingOverflow => ({
    accountId,
    target: { kind: "existing", id: 9 },
  });

  it("sends nothing when the file falls short nowhere", () => {
    expect(choicesForShortfalls([existing(2)], [])).toEqual([]);
  });

  it("keeps only the choices of the accounts where the file falls short", () => {
    const choices = [existing(2), existing(4)];

    expect(choicesForShortfalls(choices, [{ accountId: 4, amount: 100 }])).toEqual([
      existing(4),
    ]);
  });
});

describe("withOverflowChoice", () => {
  it("links the account to an existing one and leaves the input untouched", () => {
    const accounts = [account({ id: 2 }), account({ id: 3 })];

    const result = withOverflowChoice(accounts, { accountId: 2, target: { kind: "existing", id: 3 } });

    expect(result.find(({ id }) => id === 2)?.overflowAccountId).toBe(3);
    expect(accounts[0]?.overflowAccountId).toBeNull();
  });

  it("refers to an account to create by its name, in the currency of the account that overflows", () => {
    const accounts = [account({ id: 2, currency: "USD" })];

    const result = withOverflowChoice(accounts, { accountId: 2, target: { kind: "new", name: "Spare" } });

    expect(result.find(({ id }) => id === 2)?.overflowAccountId).toBe("Spare");
    expect(result.find(({ id }) => id === "Spare")).toEqual({
      id: "Spare",
      currency: "USD",
      archived: false,
      balance: 0,
      ceiling: null,
      overflowAccountId: null,
    });
  });

  it("adds an account to create once when two choices name it", () => {
    const target = { kind: "new", name: "Spare" } as const;
    const accounts = [account({ id: 2 }), account({ id: 3 })];

    const result = withOverflowChoice(
      withOverflowChoice(accounts, { accountId: 2, target }),
      { accountId: 3, target },
    );

    expect(result.filter(({ id }) => id === "Spare")).toHaveLength(1);
  });

  it("lets a deposit overflow into an account to create", () => {
    const accounts = withOverflowChoice(
      [account({ id: 2, ceiling: 1_000 })],
      { accountId: 2, target: { kind: "new", name: "Spare" } },
    );

    const plan = planSavingsTransfers(
      [{ index: 0, date: "2026-01-05", amount: -1_500, savingsAccountId: 2 }],
      accounts,
    );

    expect(plan.issues).toEqual([]);
    expect(plan.transfers).toEqual([
      {
        kind: "deposit",
        index: 0,
        date: "2026-01-05",
        placements: [
          { accountId: 2, amount: 1_000 },
          { accountId: "Spare", amount: 500 },
        ],
        unplaced: 0,
      },
    ]);
  });
});

describe("overflowTargetChoices", () => {
  const DEMAND_ID = 2;
  const RECEIVING_ID = 3;
  const choice = (overrides: Partial<SavingsAccountChoice> & { id: number }): SavingsAccountChoice => ({
    kind: "savings",
    currency: "EUR",
    archived: false,
    overflowAccountId: null,
    ...overrides,
  });

  it("offers only active savings accounts of the currency of the demand", () => {
    const accounts = [
      choice({ id: DEMAND_ID }),
      choice({ id: RECEIVING_ID, kind: "checking" }),
      choice({ id: 4 }),
      choice({ id: 5, kind: "checking" }),
      choice({ id: 6, kind: "other" }),
      choice({ id: 7, archived: true }),
      choice({ id: 8, currency: "USD" }),
    ];

    expect(overflowTargetChoices(accounts, DEMAND_ID, RECEIVING_ID, "EUR")).toEqual([4]);
  });

  it("leaves out the account that overflows and the account that receives the file", () => {
    const accounts = [choice({ id: DEMAND_ID }), choice({ id: RECEIVING_ID }), choice({ id: 4 })];

    expect(overflowTargetChoices(accounts, DEMAND_ID, RECEIVING_ID, "EUR")).toEqual([4]);
  });
});
