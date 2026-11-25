import { describe, expect, it } from "vitest";

import { parseMarkPaidForm, readSubmittedMarkPaid } from "../../../src/app/planned/mark-paid-form-data";
import { translateKey } from "../translate-key";

function formOf(fields: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) formData.set(key, value);
  return formData;
}

const parse = (fields: Record<string, string>, currency = "EUR") => {
  const formData = formOf(fields);
  return parseMarkPaidForm(readSubmittedMarkPaid(formData), currency, translateKey);
};

describe("parseMarkPaidForm", () => {
  it("parses the date and the unsigned amount to minor units, never through a float", () => {
    expect(parse({ date: "2026-11-19", amount: "1143,88" })).toEqual({
      ok: true,
      input: { date: "2026-11-19", amount: 114_388 },
    });
  });

  it("reads the minor units of the currency of the account", () => {
    expect(parse({ date: "2026-11-19", amount: "1500" }, "JPY")).toEqual({
      ok: true,
      input: { date: "2026-11-19", amount: 1_500 },
    });
  });

  it("refuses a missing or impossible date on its field and keeps the values", () => {
    const values = { date: "2026-02-30", amount: "29.90" };

    expect(parse(values)).toEqual({
      ok: false,
      error: { status: "error", field: "date", message: expect.any(String), values },
    });
    expect(parse({ date: "", amount: "29.90" })).toMatchObject({ ok: false, error: { field: "date" } });
  });

  it("refuses a signed, empty or malformed amount on its field and keeps the values", () => {
    for (const amount of ["-29.90", "", "29,9,0", "abc"]) {
      const values = { date: "2026-11-19", amount };

      expect(parse(values)).toEqual({
        ok: false,
        error: { status: "error", field: "amount", message: expect.any(String), values },
      });
    }
  });

  it("tells a signed amount with its own message", () => {
    expect(parse({ date: "2026-11-19", amount: "+29.90" })).toMatchObject({
      error: { message: "amountUnsigned" },
    });
  });
});
