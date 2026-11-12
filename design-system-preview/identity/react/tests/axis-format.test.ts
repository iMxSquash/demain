import { describe, expect, it } from "vitest";

import { formatAxisAmount } from "../axis-format";

describe("formatAxisAmount", () => {
  it("writes thousands compactly in English", () => {
    expect(formatAxisAmount(1_200_000, "EUR", "en")).toBe("€12K");
  });

  it("keeps one decimal when the tick needs it", () => {
    expect(formatAxisAmount(1_250_000, "EUR", "en")).toBe("€12.5K");
  });

  it("follows the French conventions", () => {
    expect(formatAxisAmount(1_200_000, "EUR", "fr")).toBe("12 k €");
  });

  it("writes zero plainly", () => {
    expect(formatAxisAmount(0, "EUR", "en")).toBe("€0");
  });

  it("writes a negative tick with its sign", () => {
    expect(formatAxisAmount(-500_000, "EUR", "en")).toBe("-€5K");
  });

  it("respects a currency without minor units", () => {
    expect(formatAxisAmount(120_000, "JPY", "en")).toBe("¥120K");
  });

  it("refuses an amount that is not a safe integer", () => {
    expect(() => formatAxisAmount(12.5, "EUR", "en")).toThrow(RangeError);
  });
});
