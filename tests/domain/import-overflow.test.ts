import { describe, expect, it } from "vitest";

import {
  choicesForShortfalls,
  overflowDemands,
  pendingAccountNames,
  placeholderAccountId,
  withOverflowAccount,
  type PendingOverflow,
} from "../../src/domain/import-overflow";
import type { OverflowAccount } from "../../src/domain/overflow";

const account = (overrides: Partial<OverflowAccount> & { id: number }): OverflowAccount => ({
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
        [{ index: 0, accountId: 2, amount: 5_000 }, { index: 3, accountId: 2, amount: 1_000 }],
        [{ index: 1, accountId: 2, amount: 500 }],
      ]),
    ).toEqual([{ accountId: 2, amount: 6_500, rows: 3 }]);
  });

  it("asks once per account, in the order the accounts first fall short", () => {
    expect(
      overflowDemands([
        [{ index: 0, accountId: 4, amount: 100 }],
        [{ index: 0, accountId: 2, amount: 200 }, { index: 1, accountId: 4, amount: 300 }],
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

    expect(choicesForShortfalls(choices, [{ index: 0, accountId: 4, amount: 100 }])).toEqual([
      existing(4),
    ]);
  });
});

describe("withOverflowAccount", () => {
  it("sets the overflow account of one account and leaves the input untouched", () => {
    const accounts = [account({ id: 2 }), account({ id: 3 })];

    const result = withOverflowAccount(accounts, 2, 3);

    expect(result.find(({ id }) => id === 2)?.overflowAccountId).toBe(3);
    expect(accounts[0]?.overflowAccountId).toBeNull();
  });

  it("adds an account created meanwhile when it is not known yet", () => {
    const created = account({ id: 9 });

    expect(withOverflowAccount([account({ id: 2 })], 2, 9, created).map(({ id }) => id)).toEqual([2, 9]);
  });
});

describe("placeholderAccountId", () => {
  it("gives the choices of a review distinct ids that no stored account can have", () => {
    const ids = [0, 1, 2].map(placeholderAccountId);

    expect(new Set(ids).size).toBe(3);
    expect(ids.every((id) => id < 0)).toBe(true);
  });
});

describe("pendingAccountNames", () => {
  it("names the accounts the review will create by the placeholder of their choice", () => {
    const choices: PendingOverflow[] = [
      { accountId: 2, target: { kind: "existing", id: 3 } },
      { accountId: 4, target: { kind: "new", name: "Spare" } },
    ];

    expect(pendingAccountNames(choices)).toEqual(new Map([[placeholderAccountId(1), "Spare"]]));
  });
});
