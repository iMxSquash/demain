import { describe, expect, it } from "vitest";

import { formatTypedAmount } from "../../../src/app/transactions/typed-amount";
import { formatAmount } from "../../../src/domain/money";

describe("formatTypedAmount", () => {
  it("writes a typed amount as the currency does, without a float", () => {
    expect(formatTypedAmount("42,5", "EUR", "en")).toBe("€42.50");
    expect(formatTypedAmount("1234.56", "EUR", "fr")).toBe(formatAmount(123_456, "EUR", "fr"));
  });

  it("is null while nothing is typed", () => {
    expect(formatTypedAmount("", "EUR", "en")).toBeNull();
  });

  it("is null for an amount the form would refuse", () => {
    expect(formatTypedAmount("12,", "EUR", "en")).toBeNull();
    expect(formatTypedAmount("1,234", "EUR", "en")).toBeNull();
    expect(formatTypedAmount("-5", "EUR", "en")).toBeNull();
    expect(formatTypedAmount("abc", "EUR", "en")).toBeNull();
  });

  it("is null for zero, which no transaction can hold", () => {
    expect(formatTypedAmount("0", "EUR", "en")).toBeNull();
  });
});
