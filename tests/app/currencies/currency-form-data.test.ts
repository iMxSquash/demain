import { describe, expect, it } from "vitest";

import { parseCurrencyCode, readRateValues } from "../../../src/app/currencies/currency-form-data";

function formOf(fields: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) formData.set(key, value);
  return formData;
}

describe("parseCurrencyCode", () => {
  it("uppercases a code of three letters", () => {
    expect(parseCurrencyCode(formOf({ currency: " usd " }))).toEqual({
      ok: true,
      code: "USD",
    });
  });

  it.each(["US", "USDX", "U5D", "$$$", "", "É€U"])("refuses %j", (text) => {
    expect(parseCurrencyCode(formOf({ currency: text }))).toMatchObject({
      ok: false,
      value: text.trim().toUpperCase(),
      ref: { key: "currencyCodeSyntax" },
    });
  });
});

describe("readRateValues", () => {
  it("uppercases both currency codes", () => {
    const values = readRateValues(
      formOf({ date: "2026-01-02", base: "eur", quote: "usd", rate: "1,08" }),
    );
    expect(values).toMatchObject({ base: "EUR", quote: "USD" });
  });
});
