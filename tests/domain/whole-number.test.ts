import { describe, expect, it } from "vitest";

import { isWholeNumberDraft, parseWholeNumber } from "../../src/domain/amount-syntax";

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

describe("isWholeNumberDraft", () => {
  it.each(["", "0", "12", "0123456789"])("accepts %j", (text) => {
    expect(isWholeNumberDraft(text)).toBe(true);
  });

  it.each(["-1", "1,5", "1.5", "1 2", "5%", "a"])("refuses %j", (text) => {
    expect(isWholeNumberDraft(text)).toBe(false);
  });
});
