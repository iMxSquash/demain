import { describe, expect, it } from "vitest";

import { parseAccountForm } from "../../../src/app/accounts/account-form-data";

function formOf(overrides: Record<string, string> = {}): FormData {
  const fields = {
    name: "Checking",
    kind: "checking",
    currency: "eur",
    openingDate: "2026-01-01",
    openingBalance: "56.27",
    ...overrides,
  };
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    formData.set(key, value);
  }
  return formData;
}

describe("parseAccountForm", () => {
  it("converts the submitted text to a typed input in minor units", () => {
    expect(parseAccountForm(formOf())).toEqual({
      ok: true,
      input: {
        name: "Checking",
        kind: "checking",
        currency: "EUR",
        openingDate: "2026-01-01",
        openingBalance: 5627,
        depositCeiling: null,
        overflowAccountId: null,
      },
    });
  });

  it("converts the ceiling to minor units and reads the overflow account", () => {
    const parsed = parseAccountForm(
      formOf({ depositCeiling: "1600", overflowAccountId: "2" }),
    );

    expect(parsed).toMatchObject({
      ok: true,
      input: { depositCeiling: 160_000, overflowAccountId: 2 },
    });
  });

  it("reports an unreadable ceiling on the ceiling field", () => {
    const parsed = parseAccountForm(formOf({ depositCeiling: "lots" }));

    expect(parsed).toMatchObject({
      ok: false,
      error: { field: "depositCeiling" },
    });
  });

  it("reports an unreadable overflow account on its own field", () => {
    const parsed = parseAccountForm(formOf({ overflowAccountId: "abc" }));

    expect(parsed).toMatchObject({
      ok: false,
      error: { field: "overflowAccountId" },
    });
  });

  it("normalizes the currency code before parsing the amount", () => {
    const parsed = parseAccountForm(
      formOf({ currency: " jpy ", openingBalance: "1234" }),
    );

    expect(parsed).toMatchObject({
      ok: true,
      input: { currency: "JPY", openingBalance: 1234 },
    });
  });

  it("reports an unreadable amount on the opening balance field", () => {
    const parsed = parseAccountForm(formOf({ openingBalance: "abc" }));

    expect(parsed).toMatchObject({
      ok: false,
      error: { field: "openingBalance" },
    });
  });

  it("reports a malformed currency code on the currency field", () => {
    const parsed = parseAccountForm(formOf({ currency: "EU" }));

    expect(parsed).toMatchObject({ ok: false, error: { field: "currency" } });
  });

  it("sends back what the user typed so the form can be refilled", () => {
    const parsed = parseAccountForm(
      formOf({ name: "Livret", kind: "savings", openingBalance: "abc" }),
    );

    expect(parsed).toMatchObject({
      ok: false,
      error: {
        values: {
          name: "Livret",
          kind: "savings",
          currency: "eur",
          openingDate: "2026-01-01",
          openingBalance: "abc",
        },
      },
    });
  });

  it("treats a missing field as an empty string", () => {
    const formData = formOf();
    formData.delete("name");

    expect(parseAccountForm(formData)).toMatchObject({
      ok: true,
      input: { name: "" },
    });
  });
});
