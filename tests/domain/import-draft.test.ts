import { describe, expect, it } from "vitest";

import {
  checkRowDetails,
  detailsFromSign,
  draftOfRow,
  readImportDraft,
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
  it("accepts an expense on an outgoing amount and an income on an incoming one", () => {
    expect(checkRowDetails(details({ type: "expense" }), -1_250)).toBeNull();
    expect(checkRowDetails(details({ type: "income" }), 1_250)).toBeNull();
  });

  it("refuses an expense on an incoming amount", () => {
    expect(checkRowDetails(details({ type: "expense" }), 1_250)).toBe(
      "typeSignMismatch",
    );
  });

  it("refuses an income on an outgoing amount", () => {
    expect(checkRowDetails(details({ type: "income" }), -1_250)).toBe(
      "typeSignMismatch",
    );
  });

  it("accepts savings in both directions: a deposit and a withdrawal", () => {
    const savings = details({ type: "savings", savingsAccountId: SAVINGS_ACCOUNT_ID });

    expect(checkRowDetails(savings, -30_000)).toBeNull();
    expect(checkRowDetails(savings, 5_000)).toBeNull();
  });

  it("asks for the savings account of a savings row", () => {
    expect(checkRowDetails(details({ type: "savings" }), -30_000)).toBe(
      "savingsAccountRequired",
    );
  });

  it("does not need a savings account for the other types", () => {
    expect(checkRowDetails(details({ type: "income" }), 1_250)).toBeNull();
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
