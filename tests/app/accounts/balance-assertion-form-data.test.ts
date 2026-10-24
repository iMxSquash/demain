import { describe, expect, it } from "vitest";

import { parseBalanceAssertionForm as parse } from "../../../src/app/accounts/[id]/balances/balance-assertion-form-data";
import { translateKey } from "../translate-key";

const ACCOUNT_ID = 3;

const parseBalanceAssertionForm = (formData: FormData, currency = "EUR") =>
  parse(formData, ACCOUNT_ID, currency, translateKey);

function formOf(overrides: Record<string, string> = {}): FormData {
  const fields = { date: "2026-01-31", amount: "46.27", note: "", ...overrides };
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    formData.set(key, value);
  }
  return formData;
}

describe("parseBalanceAssertionForm", () => {
  it("converts the submitted text to a typed input in minor units", () => {
    expect(parseBalanceAssertionForm(formOf({ note: "bank site" }))).toEqual({
      ok: true,
      input: {
        accountId: ACCOUNT_ID,
        date: "2026-01-31",
        amount: 4627,
        note: "bank site",
      },
    });
  });

  it("reads a negative balance", () => {
    expect(parseBalanceAssertionForm(formOf({ amount: "-12,50" }))).toMatchObject({
      ok: true,
      input: { amount: -1250 },
    });
  });

  it("uses the currency of the account to find the minor unit", () => {
    expect(
      parseBalanceAssertionForm(formOf({ amount: "1234" }), "JPY"),
    ).toMatchObject({ ok: true, input: { amount: 1234 } });
  });

  it("reports an unreadable amount on the amount field", () => {
    expect(parseBalanceAssertionForm(formOf({ amount: "abc" }))).toMatchObject({
      ok: false,
      error: { field: "amount" },
    });
  });

  it("sends back what the user typed so the form can be refilled", () => {
    expect(
      parseBalanceAssertionForm(formOf({ amount: "abc", note: "oops" })),
    ).toMatchObject({
      ok: false,
      error: { values: { date: "2026-01-31", amount: "abc", note: "oops" } },
    });
  });

  it("treats a missing field as an empty string", () => {
    const formData = formOf();
    formData.delete("note");

    expect(parseBalanceAssertionForm(formData)).toMatchObject({
      ok: true,
      input: { note: "" },
    });
  });
});
