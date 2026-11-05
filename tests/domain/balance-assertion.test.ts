import { describe, expect, it } from "vitest";

import {
  computedBalancesAt,
  computeUnexplainedGap,
  gapDirection,
  validateBalanceAssertionInput,
} from "../../src/domain/balance-assertion";

const ACCOUNT_ID = 1;
const OTHER_ACCOUNT_ID = 2;

const account = { id: ACCOUNT_ID, openingDate: "2026-01-01", openingBalance: 5627 };

function movement(accountId: number, date: string, amount: number) {
  return { accountId, date, amount };
}

describe("computeUnexplainedGap", () => {
  it("is zero when the asserted balance equals the computed balance", () => {
    const transactions = [movement(ACCOUNT_ID, "2026-01-10", -1000)];

    const result = computeUnexplainedGap(
      account,
      transactions,
      { date: "2026-01-31", amount: 4627 },
    );

    expect(result).toEqual({ computedBalance: 4627, gap: 0 });
  });

  it("is the computed balance minus the asserted amount", () => {
    const transactions = [movement(ACCOUNT_ID, "2026-01-10", -1000)];

    const result = computeUnexplainedGap(
      account,
      transactions,
      { date: "2026-01-31", amount: 4427 },
    );

    expect(result).toEqual({ computedBalance: 4627, gap: 200 });
  });

  it("is negative when the bank shows more than Demain computed", () => {
    const result = computeUnexplainedGap(account, [], {
      date: "2026-01-31",
      amount: 5927,
    });

    expect(result).toEqual({ computedBalance: 5627, gap: -300 });
  });

  it("counts the transactions of the asserted day itself (end of day)", () => {
    const transactions = [movement(ACCOUNT_ID, "2026-01-31", -500)];

    const result = computeUnexplainedGap(
      account,
      transactions,
      { date: "2026-01-31", amount: 5127 },
    );

    expect(result).toEqual({ computedBalance: 5127, gap: 0 });
  });

  it("ignores transactions after the asserted date", () => {
    const transactions = [movement(ACCOUNT_ID, "2026-02-01", -500)];

    const result = computeUnexplainedGap(
      account,
      transactions,
      { date: "2026-01-31", amount: 5627 },
    );

    expect(result).toEqual({ computedBalance: 5627, gap: 0 });
  });

  it("ignores the transactions of other accounts", () => {
    const transactions = [movement(OTHER_ACCOUNT_ID, "2026-01-10", -900)];

    const result = computeUnexplainedGap(
      account,
      transactions,
      { date: "2026-01-31", amount: 5627 },
    );

    expect(result).toEqual({ computedBalance: 5627, gap: 0 });
  });
});

describe("validateBalanceAssertionInput", () => {
  const VALID_INPUT = { accountId: ACCOUNT_ID, date: "2026-01-31", amount: 4627 };
  const OPENING = { openingDate: "2026-01-01" };

  it("accepts a complete input and gives a missing note the value null", () => {
    expect(validateBalanceAssertionInput(VALID_INPUT, OPENING)).toEqual({
      ...VALID_INPUT,
      note: null,
    });
  });

  it("trims the note and turns a blank one into null", () => {
    expect(
      validateBalanceAssertionInput({ ...VALID_INPUT, note: "  bank site " }, OPENING)
        .note,
    ).toBe("bank site");
    expect(
      validateBalanceAssertionInput({ ...VALID_INPUT, note: "   " }, OPENING).note,
    ).toBeNull();
  });

  it("accepts a negative balance", () => {
    expect(
      validateBalanceAssertionInput({ ...VALID_INPUT, amount: -1250 }, OPENING)
        .amount,
    ).toBe(-1250);
  });

  it("accepts the opening date itself", () => {
    expect(
      validateBalanceAssertionInput({ ...VALID_INPUT, date: "2026-01-01" }, OPENING)
        .date,
    ).toBe("2026-01-01");
  });

  it.each(["", "2026-1-31", "31/01/2026", "2026-02-30", "2026-13-01"])(
    "rejects the date %j",
    (date) => {
      expect(() =>
        validateBalanceAssertionInput({ ...VALID_INPUT, date }, OPENING),
      ).toThrow(expect.objectContaining({ field: "date" }));
    },
  );

  it("rejects a date before the opening of the account", () => {
    expect(() =>
      validateBalanceAssertionInput({ ...VALID_INPUT, date: "2025-12-31" }, OPENING),
    ).toThrow(expect.objectContaining({ field: "date" }));
  });

  it.each([1.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53])(
    "rejects the amount %j, which is not an integer in minor units",
    (amount) => {
      expect(() =>
        validateBalanceAssertionInput({ ...VALID_INPUT, amount }, OPENING),
      ).toThrow(expect.objectContaining({ field: "amount" }));
    },
  );
});

describe("computedBalancesAt", () => {
  const savings = { id: OTHER_ACCOUNT_ID, openingDate: "2026-01-01", openingBalance: 1000 };

  it("gives the computed balance of each account at the end of the day", () => {
    const movements = [
      movement(ACCOUNT_ID, "2026-01-10", -1000),
      movement(ACCOUNT_ID, "2026-02-01", 300),
      movement(OTHER_ACCOUNT_ID, "2026-01-31", 50),
    ];

    const balances = computedBalancesAt([account, savings], movements, "2026-01-31");

    expect(balances.get(ACCOUNT_ID)).toBe(4627);
    expect(balances.get(OTHER_ACCOUNT_ID)).toBe(1050);
  });

  it("is the opening balance when nothing happened yet", () => {
    const balances = computedBalancesAt([account], [movement(ACCOUNT_ID, "2026-03-01", 5)], "2026-01-31");

    expect(balances.get(ACCOUNT_ID)).toBe(5627);
  });

  it("has no entry for an account that was not given", () => {
    const balances = computedBalancesAt([], [movement(ACCOUNT_ID, "2026-01-10", 1)], "2026-01-31");

    expect(balances.size).toBe(0);
  });
});

describe("gapDirection", () => {
  it("is equal when the balances match", () => {
    expect(gapDirection(4627, 4627)).toBe("equal");
  });

  it("says the real balance is above when Demain holds less", () => {
    expect(gapDirection(4627, 4827)).toBe("realAbove");
  });

  it("says the real balance is below when Demain holds more", () => {
    expect(gapDirection(4627, 4427)).toBe("realBelow");
  });

  it("holds for negative balances", () => {
    expect(gapDirection(-500, -100)).toBe("realAbove");
  });
});
