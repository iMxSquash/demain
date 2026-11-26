import { describe, expect, it } from "vitest";

import {
  lastMovementDate,
  parseRealBalance,
  RealBalanceError,
} from "../../src/domain/batch-balance";

describe("lastMovementDate", () => {
  it("is the latest date of the list, whatever the order", () => {
    expect(lastMovementDate(["2026-03-10", "2026-03-31", "2026-03-02"])).toBe("2026-03-31");
  });

  it("is null when the list is empty", () => {
    expect(lastMovementDate([])).toBeNull();
  });
});

describe("parseRealBalance", () => {
  it("reads a credit as positive minor units", () => {
    expect(parseRealBalance("12,50", "EUR", "credit")).toBe(1_250);
  });

  it("reads a debit as negative minor units", () => {
    expect(parseRealBalance("12,50", "EUR", "debit")).toBe(-1_250);
  });

  it("reads a grouped amount with a decimal comma to exact minor units", () => {
    expect(parseRealBalance("1 143,88", "EUR", "credit")).toBe(114_388);
  });

  it.each([
    "-12,50",
    "+12,50",
    "\u221212,50",
    "\u20ac-12,50",
    "-\u20ac12,50",
    "\u20ac +12,50",
    "-0,00",
  ])("refuses the typed sign of %j", (text) => {
    expect(() => parseRealBalance(text, "EUR", "credit")).toThrow(RealBalanceError);
    expect(() => parseRealBalance(text, "EUR", "debit")).toThrow(RealBalanceError);
  });

  it("refuses an empty text", () => {
    expect(() => parseRealBalance("", "EUR", "credit")).toThrow(RealBalanceError);
  });

  it("refuses a text with only spaces", () => {
    expect(() => parseRealBalance("   ", "EUR", "credit")).toThrow(RealBalanceError);
  });

  it.each(["abc", "12,34,5"])("refuses the invalid text %j", (text) => {
    expect(() => parseRealBalance(text, "EUR", "credit")).toThrow(RealBalanceError);
  });

  it("never rounds a value with more decimals than the currency has", () => {
    expect(() => parseRealBalance("10,5551", "EUR", "credit")).toThrow(RealBalanceError);
  });
});
