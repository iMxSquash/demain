import { describe, expect, it } from "vitest";

import {
  parseAccountId,
  parseBalanceAssertionForm as parse,
} from "../../../src/app/accounts/[id]/balances/balance-assertion-form-data";
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

  it("reads a debit balance as a negative amount", () => {
    expect(parseBalanceAssertionForm(formOf({ amount: "12,50", side: "debit" }))).toMatchObject({
      ok: true,
      input: { amount: -1250 },
    });
  });

  it("reads a credit balance, and a missing side, as positive", () => {
    expect(parseBalanceAssertionForm(formOf({ amount: "12,50", side: "credit" }))).toMatchObject({
      ok: true,
      input: { amount: 1250 },
    });
    expect(parseBalanceAssertionForm(formOf({ amount: "12,50" }))).toMatchObject({
      ok: true,
      input: { amount: 1250 },
    });
  });

  it("keeps a zero debit at zero", () => {
    const parsed = parseBalanceAssertionForm(formOf({ amount: "0", side: "debit" }));
    expect(parsed).toMatchObject({ ok: true });
    expect(Object.is((parsed as { input: { amount: number } }).input.amount, 0)).toBe(true);
  });

  it("refuses an unknown side", () => {
    expect(parseBalanceAssertionForm(formOf({ amount: "12", side: "up" }))).toMatchObject({
      ok: false,
      error: { field: "side" },
    });
  });

  it.each([
    ["a sign", "-12,50"],
    ["a currency symbol", "12,50 €"],
    ["a grouping separator", "1.234,50"],
  ])("refuses %s on the amount field", (_label, amount) => {
    expect(parseBalanceAssertionForm(formOf({ amount }))).toMatchObject({
      ok: false,
      error: { field: "amount", message: "amountSyntax" },
    });
  });

  it("accepts a comma as the decimal separator", () => {
    expect(parseBalanceAssertionForm(formOf({ amount: "42,5" }))).toMatchObject({
      ok: true,
      input: { amount: 4250 },
    });
  });

  it("uses the currency of the account to find the minor unit", () => {
    expect(parseBalanceAssertionForm(formOf({ amount: "1234" }), "JPY")).toMatchObject({
      ok: true,
      input: { amount: 1234 },
    });
  });

  it("reports an unreadable amount on the amount field", () => {
    expect(parseBalanceAssertionForm(formOf({ amount: "abc" }))).toMatchObject({
      ok: false,
      error: { field: "amount" },
    });
  });

  it("sends back what the user typed so the form can be refilled", () => {
    expect(parseBalanceAssertionForm(formOf({ amount: "abc", note: "oops" }))).toMatchObject({
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

describe("parseAccountId", () => {
  it("reads the account chosen in the selector", () => {
    expect(parseAccountId(formOf({ accountId: "12" }))).toBe(12);
  });

  it("is null when nothing is chosen", () => {
    expect(parseAccountId(formOf())).toBeNull();
    expect(parseAccountId(formOf({ accountId: "" }))).toBeNull();
  });

  it("is null for anything but a positive integer", () => {
    for (const accountId of ["abc", "1.5", "-2", "0", "1e3"]) {
      expect(parseAccountId(formOf({ accountId }))).toBeNull();
    }
  });

  it("sends the chosen account back with the typed values", () => {
    expect(parseBalanceAssertionForm(formOf({ accountId: "4", amount: "abc" }))).toMatchObject({
      ok: false,
      error: { values: { accountId: "4" } },
    });
  });
});
