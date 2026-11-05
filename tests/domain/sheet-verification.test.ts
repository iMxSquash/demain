import { describe, expect, it } from "vitest";

import type { MonthlySynthesis } from "../../src/domain/synthesis";
import {
  compareLedgerWithSummary,
  verifyAgainstSummary,
  type ComputedMonth,
  type SheetMonth,
} from "../../src/domain/sheet-verification";

// Synthetic figures in minor units, never the owner's.
const computed = (
  month: string,
  overrides: Partial<ComputedMonth> = {},
): ComputedMonth => ({
  month,
  net: 10_000,
  savings: 5_000,
  cumulativeSavings: 5_000,
  cumulativeAccount: 5_000,
  savingsBalance: 105_000,
  ...overrides,
});

const sheet = (
  month: string,
  overrides: Partial<SheetMonth> = {},
): SheetMonth => ({
  ...computed(month),
  ...overrides,
});

describe("verifyAgainstSummary", () => {
  it("finds no difference when every figure matches", () => {
    const result = verifyAgainstSummary(
      [computed("2026-01"), computed("2026-02")],
      [sheet("2026-01"), sheet("2026-02")],
    );

    expect(result.differences).toEqual([]);
    expect(result.issues).toEqual([]);
    expect(result.isMatching).toBe(true);
  });

  it("reports each figure that differs, with both values", () => {
    const result = verifyAgainstSummary(
      [
        computed("2026-01"),
        computed("2026-02", { net: 9_900, savings: 4_000 }),
      ],
      [sheet("2026-01"), sheet("2026-02")],
    );

    expect(result.differences).toEqual([
      { month: "2026-02", figure: "net", sheet: 10_000, demain: 9_900 },
      { month: "2026-02", figure: "savings", sheet: 5_000, demain: 4_000 },
    ]);
    expect(result.isMatching).toBe(false);
  });

  it("reports differences in date order, whatever the order of the input", () => {
    const result = verifyAgainstSummary(
      [computed("2026-02", { net: 1 }), computed("2026-01", { net: 2 })],
      [sheet("2026-02"), sheet("2026-01")],
    );

    expect(result.differences.map((difference) => difference.month)).toEqual([
      "2026-01",
      "2026-02",
    ]);
  });

  it("reports a month that Demain has and the Summary does not", () => {
    const result = verifyAgainstSummary(
      [computed("2026-01"), computed("2026-02")],
      [sheet("2026-01")],
    );

    expect(result.issues).toEqual([
      { kind: "monthMissingInSheet", month: "2026-02" },
    ]);
    expect(result.isMatching).toBe(false);
  });

  it("reports a month that the Summary has and Demain does not", () => {
    const result = verifyAgainstSummary(
      [computed("2026-01")],
      [sheet("2026-01"), sheet("2026-02")],
    );

    expect(result.issues).toEqual([
      { kind: "monthMissingInDemain", month: "2026-02" },
    ]);
    expect(result.isMatching).toBe(false);
  });

  it("reports a month that appears twice in the Summary, compared on its first row", () => {
    const result = verifyAgainstSummary(
      [computed("2026-01")],
      [sheet("2026-01"), sheet("2026-01", { net: 1 })],
    );

    expect(result.issues).toEqual([
      { kind: "duplicateSheetMonth", month: "2026-01" },
    ]);
    expect(result.differences).toEqual([]);
  });

  it("reports an empty Summary cell instead of reading it as a match", () => {
    const result = verifyAgainstSummary(
      [computed("2026-01")],
      [sheet("2026-01", { savingsBalance: null })],
    );

    expect(result.issues).toEqual([
      {
        kind: "figureMissingInSheet",
        month: "2026-01",
        figure: "savingsBalance",
      },
    ]);
    expect(result.differences).toEqual([]);
    expect(result.isMatching).toBe(false);
  });
});

const synthesis = (
  month: string,
  overrides: Partial<MonthlySynthesis> = {},
): MonthlySynthesis => ({
  month,
  net: 10_000,
  savings: 5_000,
  cumulativeSavings: 5_000,
  cumulativeAccount: 5_000,
  balances: [
    { accountId: 1, currency: "EUR", balance: 20_000 },
    { accountId: 2, currency: "EUR", balance: 60_000 },
    { accountId: 3, currency: "EUR", balance: 45_000 },
  ],
  total: 125_000,
  totalByKind: { checking: 20_000, savings: 105_000, other: 0 },
  unconvertedCurrencies: [],
  ...overrides,
});

describe("compareLedgerWithSummary", () => {
  it("adds up the balances of the savings accounts for the savings balance", () => {
    const result = compareLedgerWithSummary(
      [synthesis("2026-01")],
      [2, 3],
      [sheet("2026-01")],
      "2026-03",
    );

    expect(result.isMatching).toBe(true);
  });

  it("reports a figure that differs from the stored history", () => {
    const result = compareLedgerWithSummary(
      [synthesis("2026-01", { net: 9_900 })],
      [2, 3],
      [sheet("2026-01")],
      "2026-03",
    );

    expect(result.differences).toEqual([
      { month: "2026-01", figure: "net", sheet: 10_000, demain: 9_900 },
    ]);
  });

  it("names the Summary months that are not over instead of comparing them", () => {
    const result = compareLedgerWithSummary(
      [synthesis("2026-01"), synthesis("2026-02")],
      [2, 3],
      [sheet("2026-01"), sheet("2026-02")],
      "2026-01",
    );

    expect(result.futureMonths).toEqual(["2026-02"]);
    expect(result.issues).toEqual([]);
    expect(result.isMatching).toBe(true);
  });

  it("leaves out the ledger months outside the span of the Summary", () => {
    const result = compareLedgerWithSummary(
      [synthesis("2025-12"), synthesis("2026-01"), synthesis("2026-02")],
      [2, 3],
      [sheet("2026-01")],
      "2026-02",
    );

    expect(result.issues).toEqual([]);
    expect(result.isMatching).toBe(true);
  });

  it("reports a Summary month with no month in the stored history", () => {
    const result = compareLedgerWithSummary(
      [synthesis("2026-02")],
      [2, 3],
      [sheet("2026-01"), sheet("2026-02")],
      "2026-03",
    );

    expect(result.issues).toEqual([{ kind: "monthMissingInDemain", month: "2026-01" }]);
  });

  it("is not a match when the Summary has no month to compare", () => {
    const result = compareLedgerWithSummary([synthesis("2026-01")], [2], [], "2026-03");

    expect(result).toEqual({
      differences: [],
      issues: [],
      isMatching: false,
      futureMonths: [],
    });
  });
});
