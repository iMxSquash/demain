import { describe, expect, it } from "vitest";

import {
  convertAmount,
  ExchangeRateParseError,
  formatRate,
  parseRate,
  type ExchangeRate,
} from "../../src/domain/exchange-rate";

// Rates are scaled integers: 1 EUR = 1.0821 USD is stored as 108_210_000.
const EUR_USD: ExchangeRate = {
  date: "2026-03-01",
  base: "EUR",
  quote: "USD",
  rate: 108_210_000,
};

describe("convertAmount", () => {
  it("converts minor units from the base to the quote currency", () => {
    // 100.00 EUR at 1.0821 is 108.21 USD.
    expect(convertAmount(10_000, "EUR", "USD", "2026-03-01", [EUR_USD])).toBe(
      10_821,
    );
  });

  it("uses the most recent rate on or before the date", () => {
    const rates: ExchangeRate[] = [
      { ...EUR_USD, date: "2026-02-01", rate: 100_000_000 },
      { ...EUR_USD, date: "2026-03-01", rate: 110_000_000 },
      { ...EUR_USD, date: "2026-04-01", rate: 120_000_000 },
    ];

    expect(convertAmount(10_000, "EUR", "USD", "2026-03-15", rates)).toBe(
      11_000,
    );
    expect(convertAmount(10_000, "EUR", "USD", "2026-03-01", rates)).toBe(
      11_000,
    );
  });

  it("returns null when no rate applies on or before the date", () => {
    const laterRate: ExchangeRate = { ...EUR_USD, date: "2026-06-01" };

    expect(convertAmount(10_000, "EUR", "USD", "2026-03-01", [laterRate])).toBeNull();
    expect(convertAmount(10_000, "EUR", "USD", "2026-03-01", [])).toBeNull();
  });

  it("converts against the stored direction by inverting the rate", () => {
    // 108.21 USD at 1 EUR = 1.0821 USD is 100.00 EUR.
    expect(convertAmount(10_821, "USD", "EUR", "2026-03-01", [EUR_USD])).toBe(
      10_000,
    );
  });

  it("accounts for currencies with a different number of decimals", () => {
    const eurJpy: ExchangeRate = {
      date: "2026-03-01",
      base: "EUR",
      quote: "JPY",
      rate: 16_050_000_000,
    };

    // 100.00 EUR at 160.50 is 16 050 JPY, which has no minor unit below the yen.
    expect(convertAmount(10_000, "EUR", "JPY", "2026-03-01", [eurJpy])).toBe(
      16_050,
    );
    expect(convertAmount(16_050, "JPY", "EUR", "2026-03-01", [eurJpy])).toBe(
      10_000,
    );
  });

  it("rounds to the nearest minor unit, ties away from zero", () => {
    const rate: ExchangeRate = { ...EUR_USD, rate: 110_000_000 };

    // 0.05 EUR at 1.1 is 0.055 USD: exactly half a cent.
    expect(convertAmount(5, "EUR", "USD", "2026-03-01", [rate])).toBe(6);
    expect(convertAmount(-5, "EUR", "USD", "2026-03-01", [rate])).toBe(-6);
    // 0.01 EUR at 1.1 is 0.011 USD, below half a cent.
    expect(convertAmount(1, "EUR", "USD", "2026-03-01", [rate])).toBe(1);
  });

  it("stays exact when the intermediate product exceeds the safe integer range", () => {
    // 8e15 * 108_210_000 is far above 2^53: a Number step would drift.
    expect(
      convertAmount(8_000_000_000_000_000, "EUR", "USD", "2026-03-01", [EUR_USD]),
    ).toBe(8_656_800_000_000_000);
  });

  it("refuses a result that no safe integer can hold", () => {
    expect(() =>
      convertAmount(9_000_000_000_000_000, "EUR", "USD", "2026-03-01", [EUR_USD]),
    ).toThrow(RangeError);
  });

  it("returns the amount unchanged within one currency, without any rate", () => {
    expect(convertAmount(-1_234, "EUR", "EUR", "2026-03-01", [])).toBe(-1_234);
  });
});

describe("parseRate", () => {
  it("reads a decimal rate with a point or a comma as a scaled integer", () => {
    expect(parseRate("1.0821")).toBe(108_210_000);
    expect(parseRate("1,0821")).toBe(108_210_000);
    expect(parseRate(" 160.5 ")).toBe(16_050_000_000);
    expect(parseRate("0.00623")).toBe(623_000);
  });

  it("keeps the 8 decimals of the scale and no more", () => {
    expect(parseRate("0.00000001")).toBe(1);
    expect(() => parseRate("0.000000001")).toThrow(ExchangeRateParseError);
  });

  it.each(["", "abc", "0", "0.0", "-1.2", "1.2.3", "1,", "1e3", "1 000.5"])(
    "rejects %j",
    (text) => {
      expect(() => parseRate(text)).toThrow(ExchangeRateParseError);
    },
  );
});

describe("formatRate", () => {
  it("shows the exact decimal in the locale, without padding zeros", () => {
    expect(formatRate(108_210_000, "en")).toBe("1.0821");
    expect(formatRate(108_210_000, "fr")).toBe("1,0821");
    expect(formatRate(16_050_000_000, "en")).toBe("160.5");
    expect(formatRate(1, "en")).toBe("0.00000001");
  });

  it("reads back what it shows", () => {
    expect(parseRate(formatRate(108_210_000, "fr"))).toBe(108_210_000);
  });
});
