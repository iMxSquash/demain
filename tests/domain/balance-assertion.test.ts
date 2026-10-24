import { describe, expect, it } from "vitest";

import {
  computeUnexplainedGap,
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
