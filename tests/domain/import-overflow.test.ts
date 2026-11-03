import { describe, expect, it } from "vitest";

import {
  overflowDemands,
  withOverflowAccount,
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
