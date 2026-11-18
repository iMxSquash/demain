import { describe, expect, it } from "vitest";

import {
  amountInputMode,
  applyKeypadKey,
  buildRecap,
  canGoBack,
  decimalSeparatorOf,
  firstStepWithError,
  nextStep,
  previousStep,
  stepDirection,
  stepOfField,
  STEP_COUNT,
  validateAll,
  validateStep,
  type StepContext,
  type StepDraft,
} from "../../../src/app/transactions/add-transaction-steps";

const CONTEXT: StepContext = {
  locale: "en",
  accounts: [
    { id: 1, name: "Current", currency: "EUR" },
    { id: 2, name: "Savings A", currency: "EUR" },
  ],
};

function draftOf(overrides: Partial<StepDraft> = {}): StepDraft {
  return {
    kind: "expense",
    amount: "42,5",
    label: "Groceries",
    categoryId: "",
    date: "2026-11-18",
    accountId: "1",
    destinationId: "",
    ...overrides,
  };
}

describe("step navigation", () => {
  it("has three steps", () => {
    expect(STEP_COUNT).toBe(3);
  });

  it("moves forward one step at a time", () => {
    expect(nextStep(1)).toBe(2);
    expect(nextStep(2)).toBe(3);
  });

  it("stays on the last step when going forward from it", () => {
    expect(nextStep(3)).toBe(3);
  });

  it("moves back one step at a time", () => {
    expect(previousStep(3)).toBe(2);
    expect(previousStep(2)).toBe(1);
  });

  it("stays on the first step when going back from it", () => {
    expect(previousStep(1)).toBe(1);
  });

  it("offers Back from the second step on", () => {
    expect(canGoBack(1)).toBe(false);
    expect(canGoBack(2)).toBe(true);
    expect(canGoBack(3)).toBe(true);
  });
});

describe("stepDirection", () => {
  it("is forward when the step number grows", () => {
    expect(stepDirection(1, 2)).toBe("forward");
    expect(stepDirection(1, 3)).toBe("forward");
  });

  it("is backward when the step number shrinks", () => {
    expect(stepDirection(3, 2)).toBe("backward");
    expect(stepDirection(3, 1)).toBe("backward");
  });

  it("is none when the step does not change", () => {
    expect(stepDirection(2, 2)).toBe("none");
  });
});

describe("applyKeypadKey", () => {
  it("appends a digit", () => {
    expect(applyKeypadKey("4", "2", 2)).toBe("42");
  });

  it("starts from an empty amount", () => {
    expect(applyKeypadKey("", "7", 2)).toBe("7");
  });

  it("replaces a lone zero instead of stacking leading zeros", () => {
    expect(applyKeypadKey("0", "5", 2)).toBe("5");
  });

  it("keeps a single zero when zero is typed on zero", () => {
    expect(applyKeypadKey("0", "0", 2)).toBe("0");
  });

  it("keeps a single zero when zero is typed twice on an empty amount", () => {
    expect(applyKeypadKey(applyKeypadKey("", "0", 2), "0", 2)).toBe("0");
  });

  it("writes a leading zero before a separator typed first", () => {
    expect(applyKeypadKey("", ",", 2)).toBe("0,");
    expect(applyKeypadKey("", ".", 2)).toBe("0.");
  });

  it("keeps the separator the user typed", () => {
    expect(applyKeypadKey("12", ",", 2)).toBe("12,");
    expect(applyKeypadKey("12", ".", 2)).toBe("12.");
  });

  it("ignores a second separator, whichever mark it is", () => {
    expect(applyKeypadKey("12,5", ",", 2)).toBe("12,5");
    expect(applyKeypadKey("12,5", ".", 2)).toBe("12,5");
    expect(applyKeypadKey("12,", ",", 2)).toBe("12,");
  });

  it("ignores a digit past the decimals of the currency", () => {
    expect(applyKeypadKey("12,34", "5", 2)).toBe("12,34");
  });

  it("accepts a digit up to the decimals of the currency", () => {
    expect(applyKeypadKey("12,3", "4", 2)).toBe("12,34");
  });

  it("ignores the separator for a currency without decimals", () => {
    expect(applyKeypadKey("12", ",", 0)).toBe("12");
    expect(applyKeypadKey("", ",", 0)).toBe("");
  });

  it("allows many decimals for a currency that has them", () => {
    expect(applyKeypadKey("1,23", "4", 3)).toBe("1,234");
    expect(applyKeypadKey("1,234", "5", 3)).toBe("1,234");
  });

  it("deletes the last character", () => {
    expect(applyKeypadKey("12,5", "backspace", 2)).toBe("12,");
    expect(applyKeypadKey("12,", "backspace", 2)).toBe("12");
    expect(applyKeypadKey("7", "backspace", 2)).toBe("");
  });

  it("does nothing on delete when the amount is empty", () => {
    expect(applyKeypadKey("", "backspace", 2)).toBe("");
  });

  it("returns text that is always an amount draft", () => {
    const keys = [",", "0", "0", "5", ".", "9", "9", "1", "backspace"] as const;
    let text = "";
    for (const key of keys) {
      text = applyKeypadKey(text, key, 2);
      expect(text).toMatch(/^\d*[.,]?\d*$/);
    }
  });
});

describe("validateStep, step 1", () => {
  it("accepts a valid amount", () => {
    expect(validateStep(1, draftOf({ amount: "42,5" }), CONTEXT)).toEqual([]);
  });

  it("refuses an empty amount", () => {
    const errors = validateStep(1, draftOf({ amount: "" }), CONTEXT);

    expect(errors).toEqual([
      { field: "amount", step: 1, ref: { key: "transactionAmountNonZero" } },
    ]);
  });

  it("refuses a zero amount", () => {
    const errors = validateStep(1, draftOf({ amount: "0,00" }), CONTEXT);

    expect(errors.map((error) => error.field)).toEqual(["amount"]);
  });

  it("refuses an amount that ends with a separator", () => {
    const [error] = validateStep(1, draftOf({ amount: "12," }), CONTEXT);

    expect(error?.ref?.key).toBe("amountMissingDecimals");
  });

  it("refuses an amount with too many decimals for its currency", () => {
    const [error] = validateStep(1, draftOf({ amount: "1,234" }), CONTEXT);

    expect(error?.ref?.key).toBe("amountTooManyDecimals");
  });

  it("refuses a typed sign", () => {
    const [error] = validateStep(1, draftOf({ amount: "-5" }), CONTEXT);

    expect(error?.ref?.key).toBe("amountUnsigned");
  });

  it("refuses text that is not an amount", () => {
    const [error] = validateStep(1, draftOf({ amount: "1,2,3" }), CONTEXT);

    expect(error).toMatchObject({ field: "amount", step: 1 });
  });

  it("checks the syntax alone while the account is unknown", () => {
    const unknown = draftOf({ accountId: "" });

    expect(validateStep(1, unknown, CONTEXT)).toEqual([]);
    expect(validateStep(1, draftOf({ accountId: "", amount: "" }), CONTEXT)).toHaveLength(1);
  });
});

describe("validateStep, step 2", () => {
  it("accepts a label with no category: it goes to the to-categorize queue", () => {
    expect(validateStep(2, draftOf({ label: "Groceries", categoryId: "" }), CONTEXT)).toEqual([]);
  });

  it("refuses an empty label", () => {
    expect(validateStep(2, draftOf({ label: "" }), CONTEXT)).toEqual([
      { field: "label", step: 2, ref: { key: "transactionLabelRequired" } },
    ]);
  });

  it("refuses a label made of spaces", () => {
    expect(validateStep(2, draftOf({ label: "   " }), CONTEXT)).toHaveLength(1);
  });
});

describe("validateStep, step 3", () => {
  it("accepts a date and a known account", () => {
    expect(validateStep(3, draftOf(), CONTEXT)).toEqual([]);
  });

  it("refuses an empty date", () => {
    const errors = validateStep(3, draftOf({ date: "" }), CONTEXT);

    expect(errors).toEqual([
      { field: "date", step: 3, ref: { key: "transactionDateInvalid", values: { date: "" } } },
    ]);
  });

  it("refuses a date that does not exist", () => {
    const [error] = validateStep(3, draftOf({ date: "2026-02-30" }), CONTEXT);

    expect(error?.field).toBe("date");
  });

  it("refuses a missing account", () => {
    const errors = validateStep(3, draftOf({ accountId: "" }), CONTEXT);

    expect(errors).toEqual([{ field: "accountId", step: 3, ref: { key: "accountUnknown" } }]);
  });

  it("refuses an account that is not in the list", () => {
    const errors = validateStep(3, draftOf({ accountId: "99" }), CONTEXT);

    expect(errors.map((error) => error.field)).toEqual(["accountId"]);
  });

  it("does not ask a destination of an expense", () => {
    expect(validateStep(3, draftOf({ kind: "expense", destinationId: "" }), CONTEXT)).toEqual([]);
  });

  it("accepts a transfer to another account", () => {
    const transfer = draftOf({ kind: "transfer", accountId: "1", destinationId: "2" });

    expect(validateStep(3, transfer, CONTEXT)).toEqual([]);
  });

  it("refuses a transfer without a destination", () => {
    const transfer = draftOf({ kind: "transfer", destinationId: "" });

    expect(validateStep(3, transfer, CONTEXT)).toEqual([
      { field: "destinationId", step: 3, ref: { key: "transferDestinationUnknown" } },
    ]);
  });

  it("refuses a transfer to its own source", () => {
    const transfer = draftOf({ kind: "transfer", accountId: "1", destinationId: "1" });

    expect(validateStep(3, transfer, CONTEXT)).toEqual([
      { field: "destinationId", step: 3, ref: { key: "transferSameAccount" } },
    ]);
  });
});

describe("validateAll", () => {
  it("lists the errors of every step, earliest step first", () => {
    const errors = validateAll(draftOf({ date: "", label: "", amount: "" }), CONTEXT);

    expect(errors.map((error) => error.field)).toEqual(["amount", "label", "date"]);
  });

  it("is empty for a complete draft", () => {
    expect(validateAll(draftOf(), CONTEXT)).toEqual([]);
  });
});

describe("stepOfField", () => {
  it("maps the fields of step 1", () => {
    expect(stepOfField("amount")).toBe(1);
    expect(stepOfField("kind")).toBe(1);
  });

  it("maps the fields of step 2", () => {
    expect(stepOfField("label")).toBe(2);
    expect(stepOfField("categoryId")).toBe(2);
  });

  it("maps the fields of step 3, transfer fields included", () => {
    for (const field of [
      "date",
      "accountId",
      "sourceId",
      "destinationId",
      "surplusAccountId",
      "paymentMode",
      "description",
    ] as const) {
      expect(stepOfField(field)).toBe(3);
    }
  });
});

describe("firstStepWithError", () => {
  it("is null without errors", () => {
    expect(firstStepWithError([])).toBeNull();
  });

  it("is the earliest step among the errors, whatever their order", () => {
    const errors = [
      { field: "date", step: 3 },
      { field: "label", step: 2 },
    ] as const;

    expect(firstStepWithError(errors)).toBe(2);
  });

  it("maps a server error field to its step", () => {
    expect(firstStepWithError([{ field: "amount", step: stepOfField("amount") }])).toBe(1);
  });
});

describe("buildRecap", () => {
  it("describes an expense with its sign and its formatted amount", () => {
    const recap = buildRecap(draftOf({ amount: "42,5", categoryId: "7" }), CONTEXT);

    expect(recap.amount).toEqual({ kind: "expense", sign: "out", formatted: "€42.50" });
    expect(recap.label).toEqual({ text: "Groceries", categoryId: 7 });
    expect(recap.save).toEqual({ kind: "expense", formattedAmount: "€42.50", destinationName: null });
  });

  it("sends an uncategorized label to the queue with no category id", () => {
    expect(buildRecap(draftOf({ categoryId: "" }), CONTEXT).label.categoryId).toBeNull();
  });

  it("trims the label", () => {
    expect(buildRecap(draftOf({ label: "  Bakery " }), CONTEXT).label.text).toBe("Bakery");
  });

  it("gives income and interest a positive sign and a transfer none", () => {
    expect(buildRecap(draftOf({ kind: "income" }), CONTEXT).amount.sign).toBe("in");
    expect(buildRecap(draftOf({ kind: "interest" }), CONTEXT).amount.sign).toBe("in");
    expect(buildRecap(draftOf({ kind: "transfer", destinationId: "2" }), CONTEXT).amount.sign).toBe(
      "neutral",
    );
  });

  it("names the destination of a transfer on the save button", () => {
    const recap = buildRecap(
      draftOf({ kind: "transfer", accountId: "1", destinationId: "2" }),
      CONTEXT,
    );

    expect(recap.save.destinationName).toBe("Savings A");
  });

  it("has no formatted amount while the amount is empty or invalid", () => {
    expect(buildRecap(draftOf({ amount: "" }), CONTEXT).amount.formatted).toBeNull();
    expect(buildRecap(draftOf({ amount: "1,234" }), CONTEXT).save.formattedAmount).toBeNull();
  });

  it("has no formatted amount while the account is unknown", () => {
    expect(buildRecap(draftOf({ accountId: "" }), CONTEXT).amount.formatted).toBeNull();
  });

  it("has no destination name when the destination is unknown", () => {
    const recap = buildRecap(draftOf({ kind: "transfer", destinationId: "99" }), CONTEXT);

    expect(recap.save.destinationName).toBeNull();
  });
});

describe("decimalSeparatorOf", () => {
  it("is a comma in French and a point in English", () => {
    expect(decimalSeparatorOf("fr")).toBe(",");
    expect(decimalSeparatorOf("en")).toBe(".");
  });
});

describe("amountInputMode", () => {
  it("hides the system keyboard on the phone layout once hydrated, the keypad types instead", () => {
    expect(amountInputMode(true, 375)).toBe("none");
    expect(amountInputMode(true, 759)).toBe("none");
  });

  it("keeps the decimal keyboard on the wide layout", () => {
    expect(amountInputMode(true, 760)).toBe("decimal");
    expect(amountInputMode(true, 1200)).toBe("decimal");
  });

  it("keeps the decimal keyboard before hydration, where there is no keypad", () => {
    expect(amountInputMode(false, 375)).toBe("decimal");
  });
});
