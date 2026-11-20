import { describe, expect, it } from "vitest";

import {
  fromRepetition,
  isPlannedItemOver,
  PlannedItemValidationError,
  toRepetition,
  validatePlannedItemDetails,
  validatePlannedItemInput,
  type PlannedItemContext,
  type PlannedItemInput,
} from "../../src/domain/planned-item";
import type { Repetition } from "../../src/domain/recurrence";
import type { PlannedSchedule } from "../../src/domain/occurrences";

const CONTEXT: PlannedItemContext = {
  accounts: [
    { id: 1, currency: "EUR", archived: false },
    { id: 2, currency: "EUR", archived: false },
    { id: 3, currency: "USD", archived: false },
    { id: 4, currency: "EUR", archived: true },
  ],
  categories: [
    { id: 10, archived: false },
    { id: 11, archived: true },
  ],
};

const RENT: PlannedItemInput = {
  name: "Rent",
  kind: "expense",
  accountId: 1,
  startDate: "2026-01-05",
  repetition: { kind: "monthly_on_day", day: 5 },
  amount: -80_000,
};

function refusal(input: PlannedItemInput) {
  try {
    validatePlannedItemInput(input, CONTEXT);
  } catch (error) {
    if (error instanceof PlannedItemValidationError) return error;
    throw error;
  }
  throw new Error("The input was accepted");
}

describe("validatePlannedItemInput", () => {
  it.each([
    ["an empty name", { name: "   " }, "name"],
    ["an archived account", { accountId: 4 }, "accountId"],
    ["an unknown account", { accountId: 99 }, "accountId"],
    [
      "a transfer to the same account",
      { kind: "transfer", destinationAccountId: 1 },
      "destinationAccountId",
    ],
    [
      "a transfer between two currencies",
      { kind: "transfer", destinationAccountId: 3 },
      "destinationAccountId",
    ],
    [
      "a transfer to an archived account",
      { kind: "transfer", destinationAccountId: 4 },
      "destinationAccountId",
    ],
    ["a transfer without destination", { kind: "transfer" }, "destinationAccountId"],
    [
      "a transfer with a category",
      { kind: "transfer", destinationAccountId: 2, categoryId: 10 },
      "categoryId",
    ],
    ["a destination on an expense", { destinationAccountId: 2 }, "destinationAccountId"],
    ["an archived category", { categoryId: 11 }, "categoryId"],
    ["an end date before the start date", { endDate: "2026-01-04" }, "endDate"],
    ["an invalid start date", { startDate: "2026-02-30" }, "startDate"],
    ["an end date on a one-off event", { repetition: null, endDate: "2026-06-01" }, "endDate"],
    ["a zero amount", { amount: 0 }, "amount"],
    ["a positive expense", { amount: 100 }, "amount"],
    ["a negative income", { kind: "income", amount: -100 }, "amount"],
    ["a positive transfer", { kind: "transfer", destinationAccountId: 2, amount: 100 }, "amount"],
    ["a fractional amount", { amount: -10.5 }, "amount"],
    ["day 32", { repetition: { kind: "monthly_on_day", day: 32 } }, "repetition"],
    ["a window of -1", { matchWindowDays: -1 }, "matchWindowDays"],
    ["a tolerance of 10001", { matchAmountToleranceBp: 10_001 }, "matchAmountToleranceBp"],
    ["a fractional tolerance", { matchAmountToleranceBp: 12.5 }, "matchAmountToleranceBp"],
    ["an average window of 5", { averageWindow: 5 }, "averageWindow"],
    [
      "a label filter on an item that is not a provision",
      { provisionLabelFilter: "fuel" },
      "provisionLabelFilter",
    ],
    [
      "a provision without repetition",
      { repetition: null, acceptsMultipleTransactions: true },
      "acceptsMultipleTransactions",
    ],
  ] as const)("refuses %s", (_label, change, field) => {
    const error = refusal({ ...RENT, ...change } as PlannedItemInput);

    expect(error.field).toBe(field);
    expect(error.ref.key).toEqual(expect.any(String));
  });

  it("accepts a monthly expense", () => {
    expect(validatePlannedItemInput(RENT, CONTEXT)).toMatchObject({
      name: "Rent",
      destinationAccountId: null,
      categoryId: null,
      endDate: null,
      acceptsMultipleTransactions: false,
      provisionLabelFilter: null,
      matchWindowDays: 5,
      matchAmountToleranceBp: 500,
      businessDayRule: "none",
      amountMode: "fixed",
      averageWindow: 3,
    });
  });

  it("accepts a one-off income", () => {
    const valid = validatePlannedItemInput(
      { ...RENT, name: " Tax refund ", kind: "income", amount: 25_000, repetition: null },
      CONTEXT,
    );

    expect(valid).toMatchObject({ name: "Tax refund", repetition: null, endDate: null });
  });

  it("accepts a transfer between two accounts of the same currency", () => {
    const valid = validatePlannedItemInput(
      { ...RENT, kind: "transfer", destinationAccountId: 2, amount: -5_000 },
      CONTEXT,
    );

    expect(valid.destinationAccountId).toBe(2);
  });

  it.each([0, 10_000])("accepts a tolerance of %i basis points", (tolerance) => {
    expect(
      validatePlannedItemInput({ ...RENT, matchAmountToleranceBp: tolerance }, CONTEXT)
        .matchAmountToleranceBp,
    ).toBe(tolerance);
  });

  it("accepts a provision with a repetition and a label filter", () => {
    const valid = validatePlannedItemInput(
      { ...RENT, acceptsMultipleTransactions: true, provisionLabelFilter: " fuel " },
      CONTEXT,
    );

    expect(valid.provisionLabelFilter).toBe("fuel");
  });
});

describe("validatePlannedItemDetails", () => {
  const ITEM = { kind: "expense", acceptsMultipleTransactions: false } as const;
  const DETAILS = {
    name: "Rent",
    categoryId: null,
    matchWindowDays: 5,
    matchAmountToleranceBp: 500,
    provisionLabelFilter: null,
  };

  it("refuses an archived category and a label filter without provision", () => {
    expect(() =>
      validatePlannedItemDetails({ ...DETAILS, categoryId: 11 }, ITEM, CONTEXT.categories),
    ).toThrow(expect.objectContaining({ field: "categoryId" }));
    expect(() =>
      validatePlannedItemDetails(
        { ...DETAILS, provisionLabelFilter: "fuel" },
        ITEM,
        CONTEXT.categories,
      ),
    ).toThrow(expect.objectContaining({ field: "provisionLabelFilter" }));
  });

  it("refuses a category on a transfer", () => {
    expect(() =>
      validatePlannedItemDetails(
        { ...DETAILS, categoryId: 10 },
        { kind: "transfer", acceptsMultipleTransactions: false },
        CONTEXT.categories,
      ),
    ).toThrow(expect.objectContaining({ field: "categoryId" }));
  });
});

describe("repetition mapping", () => {
  const REPETITIONS: Repetition[] = [
    { kind: "monthly_on_day", day: 15 },
    { kind: "monthly_on_last_day" },
    { kind: "every_n_months", months: 2 },
    { kind: "quarterly" },
    { kind: "yearly" },
    { kind: "every_n_weeks", weeks: 3 },
  ];

  it.each(REPETITIONS)("round-trips $kind", (repetition) => {
    const { kind, value } = fromRepetition(repetition);

    expect(toRepetition(kind, value)).toEqual(repetition);
  });

  it("round-trips a one-off event", () => {
    expect(fromRepetition(null)).toEqual({ kind: null, value: null });
    expect(toRepetition(null, null)).toBeNull();
  });

  it("refuses a stored kind that lacks its value", () => {
    expect(() => toRepetition("monthly_on_day", null)).toThrow(RangeError);
  });
});

describe("isPlannedItemOver", () => {
  const SCHEDULE: PlannedSchedule = {
    startDate: "2026-01-05",
    endDate: "2026-03-05",
    cancelled: false,
    versions: [
      {
        effectiveFrom: "2026-01-05",
        repetition: { kind: "monthly_on_day", day: 5 },
        businessDayRule: "none",
        amount: -100,
        amountMode: "fixed",
        averageWindow: 3,
      },
    ],
  };

  it("is over once cancelled", () => {
    expect(isPlannedItemOver({ ...SCHEDULE, cancelled: true }, [], "2026-01-06")).toBe(true);
  });

  it("is never over without an end date", () => {
    expect(isPlannedItemOver({ ...SCHEDULE, endDate: null }, [], "2099-01-01")).toBe(false);
  });

  it("is not over on the day of its last occurrence", () => {
    expect(isPlannedItemOver(SCHEDULE, [], "2026-03-05")).toBe(false);
  });

  it("is over the day after its last occurrence", () => {
    expect(isPlannedItemOver(SCHEDULE, [], "2026-03-06")).toBe(true);
  });

  it("ignores a cancelled last occurrence", () => {
    const cancelled = [
      { nominalDate: "2026-03-05", status: "cancelled" as const, overrideDate: null, overrideAmount: null },
    ];

    expect(isPlannedItemOver(SCHEDULE, cancelled, "2026-03-06")).toBe(true);
    expect(isPlannedItemOver(SCHEDULE, cancelled, "2026-02-05")).toBe(false);
  });

  it("follows the effective date of a moved occurrence", () => {
    const moved = [
      { nominalDate: "2026-03-05", status: "modified" as const, overrideDate: "2026-04-10", overrideAmount: null },
    ];

    expect(isPlannedItemOver(SCHEDULE, moved, "2026-04-01")).toBe(false);
    expect(isPlannedItemOver(SCHEDULE, moved, "2026-04-11")).toBe(true);
  });
});
