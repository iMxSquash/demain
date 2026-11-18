import { describe, expect, it } from "vitest";

import {
  addTransactionDefaults,
  findCreatedCategory,
  resolveDestination,
  surplusTargets,
} from "../../../src/app/transactions/add-transaction-defaults";
import {
  parseTransactionForm,
  type TransactionFormValues,
} from "../../../src/app/transactions/transaction-form-data";
import {
  TransactionValidationError,
  validateTransactionInput,
} from "../../../src/domain/transaction";
import { translateKey } from "../translate-key";

const CHECKING_ID = 1;
const SAVINGS_ID = 2;
const CURRENCIES = new Map([
  [CHECKING_ID, "EUR"],
  [SAVINGS_ID, "EUR"],
]);
const TODAY = "2026-03-15";

function formOf(values: TransactionFormValues): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(values)) formData.set(key, value);
  return formData;
}

function defaults(lastAccountId: number | null = null): TransactionFormValues {
  return addTransactionDefaults({
    today: TODAY,
    accountIds: [CHECKING_ID, SAVINGS_ID],
    lastAccountId,
  });
}

describe("addTransactionDefaults", () => {
  it("starts as an expense dated today, to categorize later", () => {
    expect(defaults()).toMatchObject({
      kind: "expense",
      date: TODAY,
      categoryId: "",
      amount: "",
      label: "",
    });
  });

  it("preselects the account used last", () => {
    expect(defaults(SAVINGS_ID).accountId).toBe(String(SAVINGS_ID));
  });

  it("falls back to the first account when the last one is gone or unknown", () => {
    expect(defaults(null).accountId).toBe(String(CHECKING_ID));
    expect(defaults(99).accountId).toBe(String(CHECKING_ID));
  });

  it("gives no account when there is none", () => {
    const values = addTransactionDefaults({ today: TODAY, accountIds: [], lastAccountId: null });

    expect(values.accountId).toBe("");
  });
});

describe("an expense needs only an amount and a label", () => {
  function submit(amount: string, label: string) {
    return parseTransactionForm(formOf({ ...defaults(), amount, label }), CURRENCIES, translateKey);
  }

  it("is accepted with the defaults and nothing else", () => {
    const parsed = submit("42,50", "Coffee");

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const valid = validateTransactionInput(parsed.input);
    expect(valid).toMatchObject({
      accountId: CHECKING_ID,
      date: TODAY,
      amount: -4_250,
      kind: "expense",
      label: "Coffee",
      categoryId: null,
      description: null,
      paymentMode: null,
    });
  });

  it("refuses the amount first when both are empty", () => {
    const parsed = submit("", "");

    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error).toMatchObject({ status: "error", field: "amount" });
  });

  it("refuses an empty label on the label field", () => {
    const parsed = submit("42,50", "  ");

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(() => validateTransactionInput(parsed.input)).toThrow(TransactionValidationError);
    try {
      validateTransactionInput(parsed.input);
    } catch (error) {
      expect(error).toMatchObject({ field: "label" });
    }
  });
});

describe("resolveDestination", () => {
  const ACCOUNT_IDS = [1, 2, 3];

  it("keeps the chosen destination while it differs from the source", () => {
    expect(resolveDestination({ accountIds: ACCOUNT_IDS, sourceId: 1, destinationId: "3" })).toBe(3);
  });

  it("falls back to the first other account when none is chosen", () => {
    expect(resolveDestination({ accountIds: ACCOUNT_IDS, sourceId: 1, destinationId: "" })).toBe(2);
  });

  it("moves away from the destination when the source becomes the same account", () => {
    expect(resolveDestination({ accountIds: ACCOUNT_IDS, sourceId: 2, destinationId: "2" })).toBe(1);
  });

  it("is null with a single account", () => {
    expect(resolveDestination({ accountIds: [1], sourceId: 1, destinationId: "" })).toBeNull();
  });
});

describe("surplusTargets", () => {
  it("offers every account but the source and the destination", () => {
    expect(surplusTargets({ accountIds: [1, 2, 3, 4], sourceId: 1, destinationId: 2 })).toEqual([3, 4]);
  });

  it("offers none when only the two accounts exist", () => {
    expect(surplusTargets({ accountIds: [1, 2], sourceId: 1, destinationId: 2 })).toEqual([]);
  });
});

describe("findCreatedCategory", () => {
  const CATEGORIES = [
    { id: 1, name: "Groceries" },
    { id: 2, name: "Rent" },
  ];

  it("finds the category that carries the typed name", () => {
    expect(findCreatedCategory(CATEGORIES, "Rent")).toEqual({ id: 2, name: "Rent" });
  });

  it("ignores case and the spaces around the typed name, as the server does", () => {
    expect(findCreatedCategory(CATEGORIES, "  groceries ")).toEqual({ id: 1, name: "Groceries" });
  });

  it("is undefined while the new category is not in the list yet", () => {
    expect(findCreatedCategory(CATEGORIES, "Leisure")).toBeUndefined();
  });
});
