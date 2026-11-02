import { describe, expect, it } from "vitest";

import {
  currencyDecimals,
  detectDecimalMark,
  divideRound,
  formatAmount,
  formatEditableAmount,
  MoneyParseError,
  parseAmount,
} from "../../src/domain/money";

describe("divideRound", () => {
  it("returns the exact quotient when the division has no remainder", () => {
    expect(divideRound(100, 4)).toBe(25);
  });

  it("rounds to the nearest integer below the half", () => {
    expect(divideRound(10, 3)).toBe(3);
  });

  it("rounds to the nearest integer above the half", () => {
    expect(divideRound(11, 3)).toBe(4);
  });

  it("rounds a positive tie away from zero", () => {
    expect(divideRound(5, 2)).toBe(3);
    expect(divideRound(1, 2)).toBe(1);
  });

  it("rounds a negative tie away from zero", () => {
    expect(divideRound(-5, 2)).toBe(-3);
    expect(divideRound(-1, 2)).toBe(-1);
  });

  it("rounds negative values to the nearest integer", () => {
    expect(divideRound(-10, 3)).toBe(-3);
    expect(divideRound(-11, 3)).toBe(-4);
  });

  it("handles a negative denominator like a negative numerator", () => {
    expect(divideRound(5, -2)).toBe(-3);
    expect(divideRound(-5, -2)).toBe(3);
  });

  it("returns 0 for a zero numerator without producing negative zero", () => {
    expect(Object.is(divideRound(0, 7), 0)).toBe(true);
    expect(Object.is(divideRound(0, -7), 0)).toBe(true);
  });

  it("stays exact on large safe integers", () => {
    expect(divideRound(Number.MAX_SAFE_INTEGER, 1)).toBe(Number.MAX_SAFE_INTEGER);
    expect(divideRound(Number.MAX_SAFE_INTEGER - 1, 2)).toBe(
      (Number.MAX_SAFE_INTEGER - 1) / 2,
    );
  });

  it("rejects a zero denominator", () => {
    expect(() => divideRound(1, 0)).toThrow(RangeError);
  });

  it("rejects non-integer operands", () => {
    expect(() => divideRound(1.5, 2)).toThrow(RangeError);
    expect(() => divideRound(1, 0.5)).toThrow(RangeError);
    expect(() => divideRound(Number.NaN, 2)).toThrow(RangeError);
  });
});

describe("currencyDecimals", () => {
  it("returns 2 decimals for EUR", () => {
    expect(currencyDecimals("EUR")).toBe(2);
  });

  it("returns 0 decimals for JPY", () => {
    expect(currencyDecimals("JPY")).toBe(0);
  });

  it("returns 3 decimals for KWD", () => {
    expect(currencyDecimals("KWD")).toBe(3);
  });
});

describe("parseAmount", () => {
  it("parses a French formatted amount with a space group separator", () => {
    expect(parseAmount("1 143,88 €", "EUR")).toBe(114388);
  });

  it("parses non-breaking and narrow non-breaking group spaces", () => {
    expect(parseAmount("1\u00a0143,88\u00a0€", "EUR")).toBe(114388);
    expect(parseAmount("1\u202f143,88", "EUR")).toBe(114388);
  });

  it("parses a plain decimal point amount", () => {
    expect(parseAmount("1143.88", "EUR")).toBe(114388);
  });

  it("parses amounts with both group and decimal separators in either convention", () => {
    expect(parseAmount("1,143.88", "EUR")).toBe(114388);
    expect(parseAmount("1.143,88", "EUR")).toBe(114388);
  });

  it("parses a whole amount and an amount with fewer decimals than the currency", () => {
    expect(parseAmount("12", "EUR")).toBe(1200);
    expect(parseAmount("12,5", "EUR")).toBe(1250);
  });

  it("keeps decimal amounts exact where a float would drift", () => {
    expect(parseAmount("0,07", "EUR")).toBe(7);
    expect(parseAmount("19,99", "EUR")).toBe(1999);
    expect(parseAmount("1.15", "EUR")).toBe(115);
    expect(parseAmount("4.35", "EUR")).toBe(435);
  });

  it("parses negative amounts, including the unicode minus sign", () => {
    expect(parseAmount("-12,50 €", "EUR")).toBe(-1250);
    expect(parseAmount("\u221212,50", "EUR")).toBe(-1250);
  });

  it("parses an explicit plus sign", () => {
    expect(parseAmount("+12,50", "EUR")).toBe(1250);
  });

  it("accepts a currency symbol or code before or after the amount", () => {
    expect(parseAmount("€ 12,50", "EUR")).toBe(1250);
    expect(parseAmount("12,50 EUR", "EUR")).toBe(1250);
    expect(parseAmount("EUR 12,50", "EUR")).toBe(1250);
  });

  it("uses the currency decimals", () => {
    expect(parseAmount("1500", "JPY")).toBe(1500);
    expect(parseAmount("1,234", "KWD")).toBe(1234);
  });

  it("returns 0 without negative zero for a negative zero amount", () => {
    expect(Object.is(parseAmount("-0,00", "EUR"), 0)).toBe(true);
  });

  it("parses amounts that only use group separators", () => {
    expect(parseAmount("1.143.000", "EUR")).toBe(114300000);
    expect(parseAmount("1 143 000", "EUR")).toBe(114300000);
  });

  it.each(["", "   ", "abc", "12 abc", "€", "--5", "1 2 3a"])(
    "rejects the non-numeric input %j",
    (input) => {
      expect(() => parseAmount(input, "EUR")).toThrow(MoneyParseError);
    },
  );

  it("rejects more decimal digits than the currency allows rather than rounding", () => {
    expect(() => parseAmount("12,505", "EUR")).toThrow(/2 decimal digits/);
    expect(() => parseAmount("1,005", "EUR")).toThrow(MoneyParseError);
    expect(() => parseAmount("15,5", "JPY")).toThrow(MoneyParseError);
  });

  it.each(["1,2,3", "1.2,3", "1,2.3.4", "12,", ",50", "1..2", "1,14.3"])(
    "rejects the misplaced separators in %j",
    (input) => {
      expect(() => parseAmount(input, "EUR")).toThrow(MoneyParseError);
    },
  );

  it("rejects an amount above the safe integer range", () => {
    expect(() => parseAmount("90 071 992 547 409,92", "EUR")).toThrow(
      /too large/,
    );
  });

  it("accepts the largest safe amount", () => {
    expect(parseAmount("90 071 992 547 409,91", "EUR")).toBe(
      Number.MAX_SAFE_INTEGER,
    );
  });

  it("rejects an ISO code that differs from the expected currency", () => {
    expect(() => parseAmount("12,50 USD", "EUR")).toThrow(/USD.*EUR/);
  });

  it("rejects an amount carrying two currency tokens or two signs", () => {
    expect(() => parseAmount("\u20ac12,50 EUR", "EUR")).toThrow(MoneyParseError);
    expect(() => parseAmount("-\u20ac-12,50", "EUR")).toThrow(MoneyParseError);
  });

  it("accepts the sign before the currency symbol", () => {
    expect(parseAmount("-\u20ac12,50", "EUR")).toBe(-1250);
  });

  it("names the offending input in the error message", () => {
    expect(() => parseAmount("12,505", "EUR")).toThrow(/"12,505"/);
  });
});

describe("parseAmount with a decimal mark", () => {
  it("reads a lone comma as a group separator when the point is the mark", () => {
    expect(parseAmount("1,234", "EUR", ".")).toBe(123_400);
    expect(parseAmount("1,234.56", "EUR", ".")).toBe(123_456);
  });

  it("reads a lone point as a group separator when the comma is the mark", () => {
    expect(parseAmount("1.234", "EUR", ",")).toBe(123_400);
    expect(parseAmount("1 234,56", "EUR", ",")).toBe(123_456);
  });

  it("keeps the sign and the currency symbol", () => {
    expect(parseAmount("-1.234 €", "EUR", ",")).toBe(-123_400);
  });

  it("rejects the other mark used as a decimal one", () => {
    expect(() => parseAmount("12,50", "EUR", ".")).toThrow(MoneyParseError);
    expect(() => parseAmount("12.50", "EUR", ",")).toThrow(MoneyParseError);
  });

  it("rejects a group separator that does not split digits by three", () => {
    expect(() => parseAmount("1,23", "EUR", ".")).toThrow(/misplaced separator/);
  });

  it("rejects the mark repeated as a group separator", () => {
    expect(() => parseAmount("1.234.56", "EUR", ".")).toThrow(MoneyParseError);
  });

  it("keeps the rules of the currency decimals", () => {
    expect(() => parseAmount("12,505", "EUR", ",")).toThrow(/2 decimal digits/);
    expect(parseAmount("1,234", "KWD", ",")).toBe(1_234);
  });
});

describe("detectDecimalMark", () => {
  it("finds the comma in French amounts", () => {
    expect(detectDecimalMark(["12,50", "-3,5", "1 234,56"])).toEqual({
      mark: ",",
      isAmbiguous: false,
    });
  });

  it("finds the point in English amounts", () => {
    expect(detectDecimalMark(["12.50", "1,234.56"])).toEqual({
      mark: ".",
      isAmbiguous: false,
    });
  });

  it("takes the last mark as the decimal one when both are present", () => {
    expect(detectDecimalMark(["1.234,56"])?.mark).toBe(",");
    expect(detectDecimalMark(["1,234.56"])?.mark).toBe(".");
  });

  it("reads a mark repeated in a cell as a group separator", () => {
    expect(detectDecimalMark(["1.234.567"])?.mark).toBe(",");
    expect(detectDecimalMark(["1,234,567"])?.mark).toBe(".");
  });

  it("takes a lone mark followed by three digits for no clue", () => {
    expect(detectDecimalMark(["1,234", "2.500"])).toBeNull();
  });

  it("finds a mark in the other cells even when one cell has none", () => {
    expect(detectDecimalMark(["1,234", "12,50"])?.mark).toBe(",");
  });

  it("is null without any clue", () => {
    expect(detectDecimalMark([])).toBeNull();
    expect(detectDecimalMark(["12", "1 500", "abc", ""])).toBeNull();
  });

  it("ignores the sign and the currency around the digits", () => {
    expect(detectDecimalMark(["-12,50 €", "EUR 3.5"])).toEqual({
      mark: ",",
      isAmbiguous: true,
    });
  });

  it("goes with the majority of a mixed file, and says so", () => {
    expect(detectDecimalMark(["1,5", "2,5", "3.5"])).toEqual({
      mark: ",",
      isAmbiguous: true,
    });
    expect(detectDecimalMark(["1.5", "2.5", "3,5"])).toEqual({
      mark: ".",
      isAmbiguous: true,
    });
  });

  it("prefers the comma on a tie, and says so", () => {
    expect(detectDecimalMark(["1.5", "2,5"])).toEqual({
      mark: ",",
      isAmbiguous: true,
    });
  });
});

describe("formatAmount", () => {
  it("formats minor units with the French conventions", () => {
    expect(formatAmount(114388, "EUR", "fr-FR")).toBe("1\u202f143,88\u00a0\u20ac");
  });

  it("formats minor units with the English conventions", () => {
    expect(formatAmount(114388, "EUR", "en-US")).toBe("\u20ac1,143.88");
  });

  it("pads amounts below one unit", () => {
    expect(formatAmount(7, "EUR", "en-US")).toBe("\u20ac0.07");
    expect(formatAmount(0, "EUR", "en-US")).toBe("\u20ac0.00");
  });

  it("formats negative amounts", () => {
    expect(formatAmount(-1250, "EUR", "fr-FR")).toBe("-12,50\u00a0\u20ac");
    expect(formatAmount(-7, "EUR", "en-US")).toBe("-\u20ac0.07");
  });

  it("uses the currency decimals", () => {
    expect(formatAmount(1500, "JPY", "en-US")).toBe("\u00a51,500");
  });

  it("stays exact at the largest safe integer", () => {
    expect(formatAmount(Number.MAX_SAFE_INTEGER, "EUR", "en-US")).toBe(
      "\u20ac90,071,992,547,409.91",
    );
  });

  it("rejects an amount that is not a safe integer", () => {
    expect(() => formatAmount(12.5, "EUR", "fr-FR")).toThrow(RangeError);
    expect(() => formatAmount(Number.MAX_SAFE_INTEGER + 1, "EUR", "fr-FR")).toThrow(
      RangeError,
    );
  });

  it.each(["fr-FR", "en-US", "de-DE"])(
    "round-trips through parseAmount in %s",
    (locale) => {
      for (const minor of [0, 7, 100, 114388, -114388, -5, 99999999]) {
        const text = formatAmount(minor, "EUR", locale);

        expect(parseAmount(text, "EUR")).toBe(minor);
      }
    },
  );
});

describe("formatEditableAmount", () => {
  it.each([
    [114388, "EUR", "1143.88"],
    [-5, "EUR", "-0.05"],
    [0, "EUR", "0.00"],
    [1234, "JPY", "1234"],
    [-1234, "JPY", "-1234"],
    [1234567, "KWD", "1234.567"],
  ])("writes %i %s as a plain decimal string", (minor, currency, expected) => {
    expect(formatEditableAmount(minor, currency)).toBe(expected);
  });

  it.each(["EUR", "USD", "CAD", "AUD", "BRL", "HKD", "NZD", "JPY", "CHF", "KWD"])(
    "round-trips through parseAmount in %s",
    (currency) => {
      for (const minor of [0, 7, 100, 114388, -114388, -5, 99999999]) {
        const text = formatEditableAmount(minor, currency);

        expect(parseAmount(text, currency)).toBe(minor);
      }
    },
  );

  it("rejects an amount that is not a safe integer", () => {
    expect(() => formatEditableAmount(1.5, "EUR")).toThrow(RangeError);
  });
});
