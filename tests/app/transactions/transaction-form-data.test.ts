import { describe, expect, it } from "vitest";

import {
  parseTransactionForm,
  parseTransferForm,
} from "../../../src/app/transactions/transaction-form-data";

const CHECKING_ID = 1;
const LIVRET_A_ID = 2;
const CURRENCIES = new Map([
  [CHECKING_ID, "EUR"],
  [LIVRET_A_ID, "EUR"],
]);

function formOf(fields: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    formData.set(key, value);
  }
  return formData;
}

function transactionForm(overrides: Record<string, string> = {}): FormData {
  return formOf({
    accountId: String(CHECKING_ID),
    date: "2026-03-15",
    kind: "expense",
    amount: "12,50",
    label: "Groceries",
    ...overrides,
  });
}

function transferForm(overrides: Record<string, string> = {}): FormData {
  return formOf({
    sourceId: String(CHECKING_ID),
    destinationId: String(LIVRET_A_ID),
    date: "2026-03-15",
    amount: "200",
    label: "Savings",
    ...overrides,
  });
}

describe("parseTransactionForm", () => {
  it("makes an expense negative from the unsigned text amount", () => {
    expect(parseTransactionForm(transactionForm(), CURRENCIES)).toMatchObject({
      ok: true,
      input: {
        accountId: CHECKING_ID,
        date: "2026-03-15",
        kind: "expense",
        amount: -1_250,
        label: "Groceries",
      },
    });
  });

  it("keeps an income positive and reads a formatted amount exactly", () => {
    const parsed = parseTransactionForm(
      transactionForm({ kind: "income", amount: "1 143,88 €" }),
      CURRENCIES,
    );

    expect(parsed).toMatchObject({ ok: true, input: { amount: 114_388 } });
  });

  it("asks for an unsigned amount instead of guessing the direction", () => {
    const parsed = parseTransactionForm(
      transactionForm({ amount: "-12.50" }),
      CURRENCIES,
    );

    expect(parsed).toMatchObject({ ok: false, error: { field: "amount" } });
  });

  it("reports an unreadable amount on the amount field", () => {
    const parsed = parseTransactionForm(
      transactionForm({ amount: "lots" }),
      CURRENCIES,
    );

    expect(parsed).toMatchObject({ ok: false, error: { field: "amount" } });
  });

  it("reports an unknown account on the account field", () => {
    const parsed = parseTransactionForm(
      transactionForm({ accountId: "99" }),
      CURRENCIES,
    );

    expect(parsed).toMatchObject({ ok: false, error: { field: "accountId" } });
  });

  it("sends back what the user typed with the error", () => {
    const parsed = parseTransactionForm(
      transactionForm({ amount: "lots", label: "Keep me" }),
      CURRENCIES,
    );

    expect(parsed).toMatchObject({
      ok: false,
      error: { values: { amount: "lots", label: "Keep me" } },
    });
  });
});

describe("parseTransferForm", () => {
  it("reads a transfer with no decision yet", () => {
    expect(parseTransferForm(transferForm(), CURRENCIES)).toEqual({
      ok: true,
      request: {
        sourceId: CHECKING_ID,
        destinationId: LIVRET_A_ID,
        amount: 20_000,
        date: "2026-03-15",
        label: "Savings",
      },
      decision: null,
    });
  });

  it("reads the decision to deposit only the room", () => {
    const parsed = parseTransferForm(
      transferForm({ decision: "room-only" }),
      CURRENCIES,
    );

    expect(parsed).toMatchObject({ ok: true, decision: { kind: "room-only" } });
  });

  it("reads the decision to send the surplus to the chosen account", () => {
    const parsed = parseTransferForm(
      transferForm({ decision: "send-surplus", surplusAccountId: "2" }),
      CURRENCIES,
    );

    expect(parsed).toMatchObject({
      ok: true,
      decision: { kind: "send-surplus", accountId: 2 },
    });
  });

  it("refuses to send the surplus without a chosen account", () => {
    const parsed = parseTransferForm(
      transferForm({ decision: "send-surplus", surplusAccountId: "" }),
      CURRENCIES,
    );

    expect(parsed).toMatchObject({
      ok: false,
      error: { field: "surplusAccountId" },
    });
  });

  it("rejects a negative or unreadable amount", () => {
    expect(
      parseTransferForm(transferForm({ amount: "-5" }), CURRENCIES),
    ).toMatchObject({ ok: false, error: { field: "amount" } });
    expect(
      parseTransferForm(transferForm({ amount: "x" }), CURRENCIES),
    ).toMatchObject({ ok: false, error: { field: "amount" } });
  });
});
