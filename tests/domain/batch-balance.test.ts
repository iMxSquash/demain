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
  it("reads a grouped amount with a decimal comma to exact minor units", () => {
    expect(parseRealBalance("1 143,88", "EUR")).toBe(114_388);
  });

  it("reads a negative balance", () => {
    expect(parseRealBalance("-20,05", "EUR")).toBe(-2_005);
  });

  it("refuses an empty text", () => {
    expect(() => parseRealBalance("", "EUR")).toThrow(RealBalanceError);
  });

  it("refuses a text with only spaces", () => {
    expect(() => parseRealBalance("   ", "EUR")).toThrow(RealBalanceError);
  });

  it.each(["abc", "12,34,5"])("refuses the invalid text %j", (text) => {
    expect(() => parseRealBalance(text, "EUR")).toThrow(RealBalanceError);
  });

  it("never rounds a value with more decimals than the currency has", () => {
    expect(() => parseRealBalance("10,5551", "EUR")).toThrow(RealBalanceError);
  });
});
