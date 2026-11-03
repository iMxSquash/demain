import { describe, expect, it } from "vitest";

import {
  amountTextForType,
  checkRowDetails,
  detailsFromSign,
  draftOfRow,
  isTypeAgainstSign,
  readImportDraft,
  signedAmountForType,
  withDefaultSavingsAccount,
  type RowDetails,
} from "../../src/domain/import-draft";

describe("readImportDraft", () => {
  it("reads a typed row into a movement, amount without floating point", () => {
    const result = readImportDraft(
      {
        date: "2026-02-05",
        label: " SALARY ",
        amount: "1 143,88 €",
        externalId: null,
      },
      "EUR",
    );

    expect(result).toEqual({
      ok: true,
      row: {
        date: "2026-02-05",
        label: "SALARY",
        amount: 114_388,
        externalId: null,
      },
    });
  });

  it("keeps the bank identifier of the row it comes from", () => {
    const result = readImportDraft(
      {
        date: "2026-02-05",
        label: "SHOP",
        amount: "-12.50",
        externalId: "FIT-1",
      },
      "EUR",
    );

    expect(result).toMatchObject({
      ok: true,
      row: { amount: -1_250, externalId: "FIT-1" },
    });
  });

  it.each([
    ["an empty date", { date: "" }, "dateInvalid"],
    ["a date that does not exist", { date: "2026-02-30" }, "dateInvalid"],
    ["a date not written year first", { date: "05/02/2026" }, "dateInvalid"],
    ["a blank label", { label: "   " }, "labelRequired"],
    ["a text that is not an amount", { amount: "twelve" }, "amountInvalid"],
    ["an empty amount", { amount: "" }, "amountInvalid"],
    ["a zero amount", { amount: "0,00" }, "amountZero"],
  ])("refuses %s", (_name, override, problem) => {
    const draft = {
      date: "2026-02-05",
      label: "SHOP",
      amount: "-12,50",
      externalId: null,
    };

    expect(readImportDraft({ ...draft, ...override }, "EUR")).toEqual({
      ok: false,
      problem,
    });
  });
});

describe("draftOfRow", () => {
  it("writes an amount that reads back unchanged", () => {
    const draft = draftOfRow(
      {
        date: "2026-02-05",
        label: "SHOP",
        amount: -1_250,
        externalId: "FIT-1",
      },
      "EUR",
    );

    expect(draft).toEqual({
      date: "2026-02-05",
      label: "SHOP",
      amount: "-12.50",
      externalId: "FIT-1",
    });
    expect(readImportDraft(draft, "EUR")).toMatchObject({
      ok: true,
      row: { amount: -1_250 },
    });
  });
});

const SAVINGS_ACCOUNT_ID = 2;

function details(overrides: Partial<RowDetails> = {}): RowDetails {
  return {
    type: "expense",
    categoryId: null,
    paymentMode: null,
    description: null,
    savingsAccountId: null,
    ...overrides,
  };
}

describe("checkRowDetails", () => {
  it("accepts an expense and an income whatever the sign of the amount", () => {
    expect(checkRowDetails(details({ type: "expense" }))).toBeNull();
    expect(checkRowDetails(details({ type: "income" }))).toBeNull();
  });

  it("accepts a savings row that names its account", () => {
    expect(
      checkRowDetails(details({ type: "savings", savingsAccountId: SAVINGS_ACCOUNT_ID })),
    ).toBeNull();
  });

  it("asks for the savings account of a savings row", () => {
    expect(checkRowDetails(details({ type: "savings" }))).toBe("savingsAccountRequired");
  });
});

describe("signedAmountForType", () => {
  it("makes an expense negative, keeping the absolute value", () => {
    expect(signedAmountForType("expense", 5_000)).toBe(-5_000);
    expect(signedAmountForType("expense", -5_000)).toBe(-5_000);
  });

  it("makes an income positive, keeping the absolute value", () => {
    expect(signedAmountForType("income", -5_000)).toBe(5_000);
    expect(signedAmountForType("income", 5_000)).toBe(5_000);
  });

  it("leaves a savings amount as it is, since savings go both ways", () => {
    expect(signedAmountForType("savings", 5_000)).toBe(5_000);
    expect(signedAmountForType("savings", -5_000)).toBe(-5_000);
  });

  it("keeps a zero amount at zero", () => {
    expect(Object.is(signedAmountForType("expense", 0), 0)).toBe(true);
    expect(signedAmountForType("income", 0)).toBe(0);
  });
});

describe("isTypeAgainstSign", () => {
  it("is true for an expense on an incoming amount and an income on an outgoing one", () => {
    expect(isTypeAgainstSign("expense", 5_000)).toBe(true);
    expect(isTypeAgainstSign("income", -5_000)).toBe(true);
  });

  it("is false when the type and the sign agree, and for savings", () => {
    expect(isTypeAgainstSign("expense", -5_000)).toBe(false);
    expect(isTypeAgainstSign("income", 5_000)).toBe(false);
    expect(isTypeAgainstSign("savings", 5_000)).toBe(false);
    expect(isTypeAgainstSign("savings", -5_000)).toBe(false);
  });
});

describe("amountTextForType", () => {
  it("shows an expense on an incoming amount as outgoing", () => {
    expect(amountTextForType("+50,00", "expense", "EUR")).toBe("-50.00");
  });

  it("shows an income on an outgoing amount as incoming", () => {
    expect(amountTextForType("-50,00", "income", "EUR")).toBe("50.00");
  });

  it("leaves the text as typed when the type and the sign agree", () => {
    expect(amountTextForType("-1 250,5 €", "expense", "EUR")).toBe("-1 250,5 €");
  });

  it("leaves savings and unreadable or null amounts as typed", () => {
    expect(amountTextForType("+50,00", "savings", "EUR")).toBe("+50,00");
    expect(amountTextForType("abc", "expense", "EUR")).toBe("abc");
    expect(amountTextForType("0", "expense", "EUR")).toBe("0");
  });

  it("is idempotent", () => {
    const once = amountTextForType("+50,00", "expense", "EUR");
    expect(amountTextForType(once, "expense", "EUR")).toBe(once);
  });
});

describe("detailsFromSign", () => {
  it("reads an outgoing amount as an expense and an incoming one as an income, with nothing else", () => {
    expect(detailsFromSign(-1_250)).toEqual(details({ type: "expense" }));
    expect(detailsFromSign(1_250)).toEqual(details({ type: "income" }));
  });
});

describe("withDefaultSavingsAccount", () => {
  it("gives a row that names no savings account the default one", () => {
    expect(withDefaultSavingsAccount(details({ type: "savings" }), 7).savingsAccountId).toBe(7);
  });

  it("keeps the savings account a row names", () => {
    expect(
      withDefaultSavingsAccount(details({ type: "savings", savingsAccountId: 3 }), 7)
        .savingsAccountId,
    ).toBe(3);
  });

  it("leaves a row with no account when there is no default either", () => {
    expect(withDefaultSavingsAccount(details({ type: "savings" }), null).savingsAccountId).toBeNull();
    expect(withDefaultSavingsAccount(details({ type: "savings" }), undefined).savingsAccountId).toBeNull();
  });
});
