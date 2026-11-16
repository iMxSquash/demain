import { describe, expect, it } from "vitest";

import {
  applyBalanceSide,
  checkAmountSyntax,
  composeSignedAmountText,
  containsTypedSign,
  isAmountDraft,
  isCurrencyCode,
  normalizeCurrencyCode,
  parseUnsignedAmount,
  readBalanceSide,
  splitBalanceSide,
  splitSignedAmountText,
  stripAmountSpaces,
} from "../../src/domain/amount-syntax";
import { MoneyParseError } from "../../src/domain/money";

describe("checkAmountSyntax", () => {
  it.each(["42", "42,5", "42.50", "0,05", ""])("accepts %j", (text) => {
    expect(checkAmountSyntax(text)).toEqual({ ok: true });
  });

  it.each([
    ["a sign", "-12,50"],
    ["a plus sign", "+12"],
    ["a currency symbol", "12€"],
    ["a currency code", "EUR 12"],
    ["a point as grouping", "1.234,50"],
    ["a comma as grouping", "1,234.50"],
    ["two separators", "1,2,3"],
    ["a leading separator", ",5"],
    ["a letter", "12a"],
    ["a trailing separator", "12,"],
    ["an exponent", "1e3"],
  ])("refuses %s", (_label, text) => {
    expect(checkAmountSyntax(text)).toMatchObject({ ok: false });
  });

  it("explains a trailing separator by the missing digits", () => {
    expect(checkAmountSyntax("12,")).toMatchObject({
      ok: false,
      ref: { key: "amountMissingDecimals" },
    });
  });

  it("refuses a space inside the value", () => {
    expect(checkAmountSyntax("1 143,88")).toMatchObject({ ok: false });
  });
});

describe("stripAmountSpaces", () => {
  it("removes spaces, no-break spaces and narrow no-break spaces", () => {
    expect(stripAmountSpaces("1 143 000 ,5")).toBe("1143000,5");
  });
});

describe("isAmountDraft", () => {
  it.each(["", "1", "12,", ",", "12,5", "0.05"])("allows %j while typing", (text) => {
    expect(isAmountDraft(text)).toBe(true);
  });

  it.each(["a", "1,2,", "1.2,3", "-1", "1 2", "1€"])("refuses %j while typing", (text) => {
    expect(isAmountDraft(text)).toBe(false);
  });
});

describe("parseUnsignedAmount", () => {
  it("reads a comma as the decimal separator", () => {
    expect(parseUnsignedAmount("42,5", "EUR")).toBe(4250);
  });

  it("reads a lone separator as decimal, never as grouping", () => {
    expect(() => parseUnsignedAmount("1,234", "EUR")).toThrow(MoneyParseError);
    expect(parseUnsignedAmount("1,234", "TND")).toBe(1234);
  });

  it("reads a whole amount in a currency without decimals", () => {
    expect(parseUnsignedAmount("1234", "JPY")).toBe(1234);
  });

  it("explains a missing fraction", () => {
    try {
      parseUnsignedAmount("12,", "EUR");
      expect.unreachable();
    } catch (error) {
      expect((error as MoneyParseError).ref.key).toBe("amountMissingDecimals");
    }
  });

  it("refuses a sign with the syntax message", () => {
    try {
      parseUnsignedAmount("-12", "EUR");
      expect.unreachable();
    } catch (error) {
      expect((error as MoneyParseError).ref.key).toBe("amountSyntax");
    }
  });
});

describe("currency code", () => {
  it("accepts three letters and uppercases them", () => {
    expect(normalizeCurrencyCode(" eur ")).toBe("EUR");
    expect(isCurrencyCode("EUR")).toBe(true);
  });

  it.each(["EU", "EURO", "E1R", "€UR", ""])("refuses %j", (text) => {
    expect(isCurrencyCode(text)).toBe(false);
  });
});

describe("balance side", () => {
  it("turns a debit into negative minor units and keeps a credit positive", () => {
    expect(applyBalanceSide(1_250, "debit")).toBe(-1_250);
    expect(applyBalanceSide(1_250, "credit")).toBe(1_250);
  });

  it("keeps a zero debit at positive zero", () => {
    expect(Object.is(applyBalanceSide(0, "debit"), 0)).toBe(true);
  });

  it("splits a negative balance into its magnitude and Debit, so that it edits back as Debit", () => {
    expect(splitBalanceSide(-1_250)).toEqual({ magnitude: 1_250, side: "debit" });
  });

  it("splits a positive balance and zero as Credit", () => {
    expect(splitBalanceSide(1_250)).toEqual({ magnitude: 1_250, side: "credit" });
    expect(splitBalanceSide(0)).toEqual({ magnitude: 0, side: "credit" });
  });

  it("reads a missing side as credit and refuses an unknown one", () => {
    expect(readBalanceSide("")).toBe("credit");
    expect(readBalanceSide("debit")).toBe("debit");
    expect(readBalanceSide("up")).toBeNull();
  });
});

describe("containsTypedSign", () => {
  it.each(["-12,50", "+12,50", "\u221212,50", "\u20ac-12,50", "-\u20ac12", "12,50-"])(
    "finds the sign of %j",
    (text) => {
      expect(containsTypedSign(text)).toBe(true);
    },
  );

  it.each(["12,50", "", "\u20ac12.5", "1 143,88"])("finds no sign in %j", (text) => {
    expect(containsTypedSign(text)).toBe(false);
  });
});

describe("signed amount text of a cell", () => {
  it("splits a minus into the amount and Debit", () => {
    expect(splitSignedAmountText("-12,50")).toEqual({ magnitude: "12,50", side: "debit" });
    expect(splitSignedAmountText("\u221212.50")).toEqual({ magnitude: "12.50", side: "debit" });
  });

  it("splits a plus or no sign into the amount and Credit", () => {
    expect(splitSignedAmountText("+12,50")).toEqual({ magnitude: "12,50", side: "credit" });
    expect(splitSignedAmountText("12,50")).toEqual({ magnitude: "12,50", side: "credit" });
  });

  it("keeps the side of a Debit chosen before any amount is typed", () => {
    expect(splitSignedAmountText("-")).toEqual({ magnitude: "", side: "debit" });
  });

  it("composes the text back, as typed and without arithmetic", () => {
    expect(composeSignedAmountText("12,50", "debit")).toBe("-12,50");
    expect(composeSignedAmountText("12,50", "credit")).toBe("12,50");
    expect(composeSignedAmountText("", "debit")).toBe("-");
    expect(composeSignedAmountText("", "credit")).toBe("");
  });

  it("round-trips the text of a stored negative amount", () => {
    const { magnitude, side } = splitSignedAmountText("-1250.00");
    expect(composeSignedAmountText(magnitude, side)).toBe("-1250.00");
  });
});
