import { describe, expect, it } from "vitest";

import {
  formatTolerancePercent,
  fromRepetition,
  isPlannedItemOver,
  isTolerancePercentDraft,
  parseTolerancePercent,
  PlannedItemValidationError,
  toRepetition,
  validatePlannedItemDetails,
  validatePlannedItemInput,
  validatePlannedItemVersion,
  versionInEffectAt,
  type PlannedItemContext,
  type PlannedItemInput,
  type PlannedItemVersionInput,
} from "../../src/domain/planned-item";
import type { Repetition } from "../../src/domain/recurrence";
import type { PlannedSchedule, PlannedVersion } from "../../src/domain/occurrences";

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

  it("reads a blank label filter as none", () => {
    const valid = validatePlannedItemInput(
      { ...RENT, acceptsMultipleTransactions: true, provisionLabelFilter: "   " },
      CONTEXT,
    );

    expect(valid.provisionLabelFilter).toBeNull();
  });

  it("accepts a blank label filter on an item that is not a provision", () => {
    const valid = validatePlannedItemInput({ ...RENT, provisionLabelFilter: "  " }, CONTEXT);

    expect(valid.provisionLabelFilter).toBeNull();
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

  it("refuses an archived category", () => {
    expect(() =>
      validatePlannedItemDetails({ ...DETAILS, categoryId: 11 }, ITEM, CONTEXT.categories),
    ).toThrow(expect.objectContaining({ field: "categoryId" }));
  });

  it("refuses a label filter on an item that is not a provision", () => {
    expect(() =>
      validatePlannedItemDetails(
        { ...DETAILS, provisionLabelFilter: "fuel" },
        ITEM,
        CONTEXT.categories,
      ),
    ).toThrow(expect.objectContaining({ field: "provisionLabelFilter" }));
  });

  it("trims the label filter of a provision and reads a blank one as none", () => {
    const provision = { kind: "expense", acceptsMultipleTransactions: true } as const;

    expect(
      validatePlannedItemDetails({ ...DETAILS, provisionLabelFilter: " Market " }, provision, CONTEXT.categories),
    ).toMatchObject({ provisionLabelFilter: "Market" });
    expect(
      validatePlannedItemDetails({ ...DETAILS, provisionLabelFilter: "  " }, provision, CONTEXT.categories),
    ).toMatchObject({ provisionLabelFilter: null });
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

describe("parseTolerancePercent", () => {
  it.each([
    ["5", 500],
    ["2,5", 250],
    ["2.5", 250],
    ["0", 0],
    ["100", 10_000],
    ["0,01", 1],
    ["12.34", 1234],
    [" 5 ", 500],
  ])("reads %j as %d basis points", (text, expected) => {
    expect(parseTolerancePercent(text)).toBe(expected);
  });

  it.each([
    ["an empty text", ""],
    ["a sign", "-1"],
    ["more than two decimals", "5,555"],
    ["a grouping space", "1 000"],
    ["a percent sign", "5%"],
    ["more than 100 percent", "101"],
    ["a trailing separator", "5,"],
    ["a second separator", "1.2.3"],
  ])("refuses %s", (_label, text) => {
    expect(() => parseTolerancePercent(text)).toThrow(PlannedItemValidationError);
  });

  it("names the tolerance field in its refusal", () => {
    try {
      parseTolerancePercent("101");
    } catch (error) {
      expect(error).toMatchObject({ field: "matchAmountToleranceBp" });
      return;
    }
    throw new Error("The text was accepted");
  });
});

describe("formatTolerancePercent", () => {
  it.each([
    [500, "5"],
    [250, "2.5"],
    [1, "0.01"],
    [0, "0"],
    [10_000, "100"],
    [1234, "12.34"],
  ])("writes %d basis points as %j", (basisPoints, expected) => {
    expect(formatTolerancePercent(basisPoints)).toBe(expected);
  });

  it.each([0, 1, 250, 500, 1234, 9999, 10_000])(
    "reads back what it wrote for %d",
    (basisPoints) => {
      expect(parseTolerancePercent(formatTolerancePercent(basisPoints))).toBe(basisPoints);
    },
  );
});

describe("isTolerancePercentDraft", () => {
  it.each(["", "5", "2,", "2.5", "12,34", "100", "100,0", "100.00", "0"])(
    "accepts %j, which can still become a tolerance",
    (text) => {
      expect(isTolerancePercentDraft(text)).toBe(true);
    },
  );

  it.each([
    ["a sign", "-1"],
    ["a percent sign", "5%"],
    ["a third decimal", "5,555"],
    ["a second separator", "1.2.3"],
    ["a grouping space", "1 000"],
    ["more than 100", "101"],
    ["more than three digits", "1000"],
    ["decimals after 100", "100,5"],
    ["a letter", "a"],
  ])("refuses %s", (_label, text) => {
    expect(isTolerancePercentDraft(text)).toBe(false);
  });

  it.each(["", "5", "2,", "2.5", "12,34", "100", "0"])(
    "agrees with the parser: a complete draft %j is read or refused only for its shape",
    (text) => {
      // Whatever the browser lets through, the server never refuses it for being above 100.
      if (text === "" || text.endsWith(",")) return;
      expect(() => parseTolerancePercent(text)).not.toThrow();
    },
  );
});

describe("versionInEffectAt", () => {
  const VERSIONS = [
    { effectiveFrom: "2026-01-05", amount: 1 },
    { effectiveFrom: "2026-04-05", amount: 2 },
    { effectiveFrom: "2026-09-05", amount: 3 },
  ];

  it.each([
    ["on the first effective date", "2026-01-05", 1],
    ["between two versions", "2026-06-30", 2],
    ["on the effective date of a version", "2026-04-05", 2],
    ["after the last version", "2030-01-01", 3],
    ["before the first version", "2025-01-01", 1],
  ])("picks the version in effect %s", (_label, date, amount) => {
    expect(versionInEffectAt(VERSIONS, date).amount).toBe(amount);
  });

  it("throws on an empty list", () => {
    expect(() => versionInEffectAt([], "2026-01-01")).toThrow(RangeError);
  });
});

describe("validatePlannedItemVersion amount mode", () => {
  const rollingVersion = {
    effectiveFrom: "2026-01-05",
    repetition: { kind: "monthly_on_day", day: 5 } as Repetition,
    businessDayRule: "none" as const,
    amount: -80_000,
    amountMode: "rolling_average" as const,
    averageWindow: 12,
  };
  const fixedVersion = { ...rollingVersion, amountMode: "fixed" as const, averageWindow: 3 };

  const contextOf = (version: PlannedVersion) => ({
    item: {
      kind: "expense" as const,
      startDate: "2026-01-05",
      endDate: null,
      cancelled: false,
      versions: [version],
    },
    accountArchived: false,
    settledNominalDates: [],
    overrides: [],
  });

  const change: PlannedItemVersionInput = {
    effectiveFrom: "2026-04-05",
    repetition: { kind: "monthly_on_day", day: 5 },
    amount: -85_000,
  };

  it("returns the submitted mode and window", () => {
    const valid = validatePlannedItemVersion(
      { ...change, amountMode: "rolling_average", averageWindow: 6 },
      contextOf(fixedVersion),
    );

    expect(valid).toMatchObject({ amountMode: "rolling_average", averageWindow: 6 });
  });

  it("inherits the mode and window of the version in effect when absent", () => {
    const valid = validatePlannedItemVersion(change, contextOf(rollingVersion));

    expect(valid).toMatchObject({ amountMode: "rolling_average", averageWindow: 12 });
  });

  it("refuses a window outside the allowed values", () => {
    let error: unknown;
    try {
      validatePlannedItemVersion(
        { ...change, amountMode: "rolling_average", averageWindow: 5 },
        contextOf(fixedVersion),
      );
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(PlannedItemValidationError);
    expect((error as PlannedItemValidationError).field).toBe("averageWindow");
  });

  it("accepts switching back to the fixed mode", () => {
    const valid = validatePlannedItemVersion(
      { ...change, amountMode: "fixed" },
      contextOf(rollingVersion),
    );

    expect(valid).toMatchObject({ amountMode: "fixed" });
  });
});
