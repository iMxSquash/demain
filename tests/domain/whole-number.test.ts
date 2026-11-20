import { describe, expect, it } from "vitest";

import { firstNonDigit, parseWholeNumber } from "../../src/domain/amount-syntax";

describe("parseWholeNumber", () => {
  it.each([
    ["12", 12],
    ["0", 0],
    ["007", 7],
    [" 5 ", 5],
  ])("reads %j as %d", (text, expected) => {
    expect(parseWholeNumber(text)).toBe(expected);
  });

  it.each(["", "-1", "1,5", "1.5", "1 000", "5%", "abc"])("refuses %j", (text) => {
    expect(parseWholeNumber(text)).toBeNull();
  });
});

describe("firstNonDigit", () => {
  it("returns the first character that is not a digit", () => {
    expect(firstNonDigit("12a3b")).toBe("a");
  });

  it("returns nothing for digits only and for an empty text", () => {
    expect(firstNonDigit("0123456789")).toBeUndefined();
    expect(firstNonDigit("")).toBeUndefined();
  });
});
