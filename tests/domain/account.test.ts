import { describe, expect, it } from "vitest";

import {
  assertCurrencyChangeAllowed,
  validateAccountInput,
} from "../../src/domain/account";

const VALID_INPUT = {
  name: "Checking",
  kind: "checking",
  currency: "EUR",
  openingDate: "2026-01-01",
  openingBalance: 5627,
};

describe("validateAccountInput", () => {
  it("accepts a complete input and trims the name", () => {
    const account = validateAccountInput({ ...VALID_INPUT, name: "  Livret A " });

    expect(account).toEqual({ ...VALID_INPUT, name: "Livret A" });
  });

  it("rejects a blank name", () => {
    expect(() => validateAccountInput({ ...VALID_INPUT, name: "   " })).toThrow(
      expect.objectContaining({ name: "AccountValidationError", field: "name" }),
    );
  });

  it.each(["checking", "savings", "other"])("accepts the kind %s", (kind) => {
    expect(validateAccountInput({ ...VALID_INPUT, kind }).kind).toBe(kind);
  });

  it("rejects an unknown kind", () => {
    expect(() =>
      validateAccountInput({ ...VALID_INPUT, kind: "brokerage" }),
    ).toThrow(expect.objectContaining({ field: "kind" }));
  });

  it("accepts another ISO 4217 currency", () => {
    expect(validateAccountInput({ ...VALID_INPUT, currency: "USD" }).currency).toBe(
      "USD",
    );
  });

  it.each(["", "ZZZ", "eur", "EURO"])("rejects the currency %j", (currency) => {
    expect(() => validateAccountInput({ ...VALID_INPUT, currency })).toThrow(
      expect.objectContaining({ field: "currency" }),
    );
  });

  it.each([0, -1500])("accepts the opening balance %d", (openingBalance) => {
    expect(
      validateAccountInput({ ...VALID_INPUT, openingBalance }).openingBalance,
    ).toBe(openingBalance);
  });

  it.each([
    ["a fractional amount", 12.5],
    ["NaN", Number.NaN],
    ["infinity", Number.POSITIVE_INFINITY],
    ["an integer beyond the safe range", 2 ** 53],
  ])("rejects %s as opening balance", (_label, openingBalance) => {
    expect(() =>
      validateAccountInput({ ...VALID_INPUT, openingBalance }),
    ).toThrow(expect.objectContaining({ field: "openingBalance" }));
  });

  it("accepts a leap day on a leap year", () => {
    expect(
      validateAccountInput({ ...VALID_INPUT, openingDate: "2028-02-29" })
        .openingDate,
    ).toBe("2028-02-29");
  });

  it.each(["", "2026-1-1", "01/01/2026", "2026-02-30", "2026-02-29", "2026-13-01"])(
    "rejects the opening date %j",
    (openingDate) => {
      expect(() =>
        validateAccountInput({ ...VALID_INPUT, openingDate }),
      ).toThrow(expect.objectContaining({ field: "openingDate" }));
    },
  );
});

describe("validateAccountInput deposit ceiling", () => {
  it("accepts a ceiling in minor units", () => {
    const account = validateAccountInput({ ...VALID_INPUT, depositCeiling: 160_000 });

    expect(account.depositCeiling).toBe(160_000);
  });

  it("accepts an account without ceiling", () => {
    expect(() =>
      validateAccountInput({ ...VALID_INPUT, depositCeiling: null }),
    ).not.toThrow();
  });

  it.each([-1, 12.5, Number.NaN, Number.MAX_SAFE_INTEGER + 2])(
    "rejects the ceiling %s",
    (depositCeiling) => {
      expect(() =>
        validateAccountInput({ ...VALID_INPUT, depositCeiling }),
      ).toThrow(expect.objectContaining({ field: "depositCeiling" }));
    },
  );
});

describe("assertCurrencyChangeAllowed", () => {
  it("allows changing the currency while the account has no transactions", () => {
    expect(() =>
      assertCurrencyChangeAllowed("EUR", "USD", { hasTransactions: false }),
    ).not.toThrow();
  });

  it("refuses changing the currency once the account has transactions", () => {
    expect(() =>
      assertCurrencyChangeAllowed("EUR", "USD", { hasTransactions: true }),
    ).toThrow(expect.objectContaining({ field: "currency" }));
  });

  it("allows keeping the same currency when the account has transactions", () => {
    expect(() =>
      assertCurrencyChangeAllowed("EUR", "EUR", { hasTransactions: true }),
    ).not.toThrow();
  });
});
