import { describe, expect, it } from "vitest";

import {
  parsePlannedItemDetailsForm,
  parsePlannedItemForm as parse,
} from "../../../src/app/planned/planned-item-form-data";
import { translateKey } from "../translate-key";

// Account 1 is in euros, account 2 too, account 3 in yen: the currency decides the minor units.
const CURRENCIES = new Map([
  [1, "EUR"],
  [2, "EUR"],
  [3, "JPY"],
]);

const parsePlannedItemForm = (formData: FormData) => parse(formData, CURRENCIES, translateKey);

function formOf(overrides: Record<string, string> = {}): FormData {
  const fields = {
    name: "Music streaming",
    kind: "expense",
    accountId: "1",
    categoryId: "10",
    startDate: "2026-12-12",
    repetition: "monthly_on_day",
    repetitionValue: "12",
    businessDayRule: "none",
    amount: "9,99",
    matchWindowDays: "5",
    matchTolerancePercent: "5",
    ...overrides,
  };
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    formData.set(key, value);
  }
  return formData;
}

describe("parsePlannedItemForm", () => {
  it("parses a monthly expense on day 12 into a negative amount", () => {
    expect(parsePlannedItemForm(formOf())).toEqual({
      ok: true,
      input: {
        name: "Music streaming",
        kind: "expense",
        accountId: 1,
        destinationAccountId: null,
        categoryId: 10,
        startDate: "2026-12-12",
        endDate: null,
        repetition: { kind: "monthly_on_day", day: 12 },
        businessDayRule: "none",
        amount: -999,
        matchWindowDays: 5,
        matchAmountToleranceBp: 500,
      },
    });
  });

  it("reads the amount in the minor units of the currency of the account", () => {
    expect(parsePlannedItemForm(formOf({ accountId: "3", amount: "1200" }))).toMatchObject({
      ok: true,
      input: { amount: -1200 },
    });
  });

  it("parses a one-off income and ignores a submitted end date for it", () => {
    const parsed = parsePlannedItemForm(
      formOf({
        kind: "income",
        repetition: "once",
        repetitionValue: "12",
        startDate: "2027-03-05",
        endDate: "2027-12-31",
        amount: "250",
      }),
    );

    expect(parsed).toMatchObject({
      ok: true,
      input: { kind: "income", repetition: null, endDate: null, amount: 25_000 },
    });
  });

  it("keeps the end date of a repeating item", () => {
    expect(parsePlannedItemForm(formOf({ endDate: "2027-12-31" }))).toMatchObject({
      ok: true,
      input: { endDate: "2027-12-31" },
    });
  });

  it.each([
    ["monthly_on_day", "5", { kind: "monthly_on_day", day: 5 }],
    ["monthly_on_last_day", "", { kind: "monthly_on_last_day" }],
    ["every_n_months", "2", { kind: "every_n_months", months: 2 }],
    ["quarterly", "", { kind: "quarterly" }],
    ["yearly", "", { kind: "yearly" }],
    ["every_n_weeks", "3", { kind: "every_n_weeks", weeks: 3 }],
  ])("parses the repetition %s", (repetition, repetitionValue, expected) => {
    expect(parsePlannedItemForm(formOf({ repetition, repetitionValue }))).toMatchObject({
      ok: true,
      input: { repetition: expected },
    });
  });

  it("ignores the number of a repetition that has none", () => {
    expect(
      parsePlannedItemForm(formOf({ repetition: "quarterly", repetitionValue: "abc" })),
    ).toMatchObject({ ok: true, input: { repetition: { kind: "quarterly" } } });
  });

  it.each([
    ["every N weeks without N", "every_n_weeks", ""],
    ["every N months without N", "every_n_months", ""],
    ["monthly on a day with day 0", "monthly_on_day", "0"],
    ["monthly on a day with day 32", "monthly_on_day", "32"],
    ["a number that is not whole", "every_n_weeks", "1,5"],
  ])("refuses %s on the number field", (_label, repetition, repetitionValue) => {
    expect(parsePlannedItemForm(formOf({ repetition, repetitionValue }))).toMatchObject({
      ok: false,
      error: { field: "repetitionValue", message: "plannedItemRepetitionNumberInvalid" },
    });
  });

  it("refuses an unknown repetition", () => {
    expect(parsePlannedItemForm(formOf({ repetition: "daily" }))).toMatchObject({
      ok: false,
      error: { field: "repetition", message: "plannedItemRepetitionInvalid" },
    });
  });

  it("refuses an unknown business-day rule", () => {
    expect(parsePlannedItemForm(formOf({ businessDayRule: "sometimes" }))).toMatchObject({
      ok: false,
      error: { field: "businessDayRule", message: "plannedItemBusinessDayRuleInvalid" },
    });
  });

  it.each(["previous", "next"])("accepts the business-day rule %s", (businessDayRule) => {
    expect(parsePlannedItemForm(formOf({ businessDayRule }))).toMatchObject({
      ok: true,
      input: { businessDayRule },
    });
  });

  it.each([
    ["a minus sign", "-5", "amountUnsigned"],
    ["a plus sign", "+5", "amountUnsigned"],
    ["a currency symbol", "5 €", "amountSyntax"],
    ["a grouping separator", "1.000,00", "amountSyntax"],
    ["letters", "abc", "amountSyntax"],
  ])("refuses an amount with %s", (_label, amount, message) => {
    expect(parsePlannedItemForm(formOf({ amount }))).toMatchObject({
      ok: false,
      error: { field: "amount", message },
    });
  });

  it("signs the amount from the kind", () => {
    const signOf = (kind: string, extra: Record<string, string> = {}) => {
      const parsed = parsePlannedItemForm(formOf({ kind, amount: "10", ...extra }));
      return parsed.ok ? parsed.input.amount : null;
    };

    expect(signOf("expense")).toBe(-1000);
    expect(signOf("income")).toBe(1000);
    expect(signOf("interest")).toBe(1000);
    expect(signOf("transfer", { destinationAccountId: "2" })).toBe(-1000);
  });

  it("refuses an unknown kind", () => {
    expect(parsePlannedItemForm(formOf({ kind: "gift" }))).toMatchObject({
      ok: false,
      error: { field: "kind", message: "plannedItemKindUnknown" },
    });
  });

  it("refuses an account that does not exist", () => {
    expect(parsePlannedItemForm(formOf({ accountId: "99" }))).toMatchObject({
      ok: false,
      error: { field: "accountId", message: "accountUnknown" },
    });
  });

  it("refuses a transfer without destination", () => {
    expect(parsePlannedItemForm(formOf({ kind: "transfer" }))).toMatchObject({
      ok: false,
      error: {
        field: "destinationAccountId",
        message: "plannedItemTransferDestinationRequired",
      },
    });
  });

  it("drops the category of a transfer and keeps its destination", () => {
    expect(
      parsePlannedItemForm(
        formOf({ kind: "transfer", destinationAccountId: "2", categoryId: "10" }),
      ),
    ).toMatchObject({
      ok: true,
      input: { kind: "transfer", destinationAccountId: 2, categoryId: null },
    });
  });

  it("drops the destination of anything but a transfer", () => {
    expect(parsePlannedItemForm(formOf({ destinationAccountId: "2" }))).toMatchObject({
      ok: true,
      input: { destinationAccountId: null },
    });
  });

  it("reads an empty category as none", () => {
    expect(parsePlannedItemForm(formOf({ categoryId: "" }))).toMatchObject({
      ok: true,
      input: { categoryId: null },
    });
  });

  it("refuses a category that is not a number", () => {
    expect(parsePlannedItemForm(formOf({ categoryId: "abc" }))).toMatchObject({
      ok: false,
      error: { field: "categoryId", message: "categoryUnknown" },
    });
  });

  it.each([
    ["5", 500],
    ["2,5", 250],
    ["2.5", 250],
    ["0", 0],
  ])("reads the tolerance %j as %d basis points", (matchTolerancePercent, expected) => {
    expect(parsePlannedItemForm(formOf({ matchTolerancePercent }))).toMatchObject({
      ok: true,
      input: { matchAmountToleranceBp: expected },
    });
  });

  it("refuses a tolerance above 100 percent on its own field", () => {
    expect(parsePlannedItemForm(formOf({ matchTolerancePercent: "101" }))).toMatchObject({
      ok: false,
      error: { field: "matchTolerancePercent", message: "plannedItemTolerancePercentInvalid" },
    });
  });

  it.each(["", "abc", "-1", "1,5"])("refuses the matching window %j", (matchWindowDays) => {
    expect(parsePlannedItemForm(formOf({ matchWindowDays }))).toMatchObject({
      ok: false,
      error: { field: "matchWindowDays", message: "plannedItemMatchWindowInvalid" },
    });
  });

  it("keeps every typed value in the error state", () => {
    const parsed = parsePlannedItemForm(
      formOf({
        name: "Rent",
        kind: "transfer",
        accountId: "1",
        destinationAccountId: "2",
        categoryId: "11",
        startDate: "2027-01-05",
        endDate: "2027-12-31",
        repetition: "every_n_months",
        repetitionValue: "2",
        businessDayRule: "next",
        amount: "abc",
        matchWindowDays: "7",
        matchTolerancePercent: "2,5",
      }),
    );

    expect(parsed).toMatchObject({
      ok: false,
      error: {
        field: "amount",
        values: {
          name: "Rent",
          kind: "transfer",
          accountId: "1",
          destinationAccountId: "2",
          categoryId: "11",
          startDate: "2027-01-05",
          endDate: "2027-12-31",
          repetition: "every_n_months",
          repetitionValue: "2",
          businessDayRule: "next",
          amount: "abc",
          matchWindowDays: "7",
          matchTolerancePercent: "2,5",
        },
      },
    });
  });

  it("treats a missing field as an empty string", () => {
    const formData = formOf();
    formData.delete("name");

    expect(parsePlannedItemForm(formData)).toMatchObject({ ok: true, input: { name: "" } });
  });
});

describe("parsePlannedItemDetailsForm", () => {
  const detailsOf = (overrides: Record<string, string> = {}) => {
    const formData = new FormData();
    const fields = {
      name: "Rent",
      categoryId: "11",
      matchWindowDays: "7",
      matchTolerancePercent: "2,5",
      ...overrides,
    };
    for (const [key, value] of Object.entries(fields)) formData.set(key, value);
    return parsePlannedItemDetailsForm(formData, "Market", translateKey);
  };

  it("parses the four editable details and keeps the label filter of the item", () => {
    expect(detailsOf()).toEqual({
      ok: true,
      details: {
        name: "Rent",
        categoryId: 11,
        matchWindowDays: 7,
        matchAmountToleranceBp: 250,
        provisionLabelFilter: "Market",
      },
    });
  });

  it("reads an empty category as none", () => {
    expect(detailsOf({ categoryId: "" })).toMatchObject({
      ok: true,
      details: { categoryId: null },
    });
  });

  it("refuses an unreadable tolerance on its field and keeps the typed values", () => {
    expect(detailsOf({ matchTolerancePercent: "abc" })).toMatchObject({
      ok: false,
      error: {
        field: "matchTolerancePercent",
        values: { name: "Rent", matchWindowDays: "7", matchTolerancePercent: "abc" },
      },
    });
  });
});
