import { describe, expect, it } from "vitest";

import type { SheetRow } from "../../src/domain/sheet-import";
import {
  readSheetSummary,
  scopeSummary,
  type SummaryMonth,
} from "../../src/domain/sheet-summary";

// Headers as named in DOMAIN; the figures are synthetic.
const HEADER =
  "Month;Final balance;Savings;Cumulative savings;Cumulative account;Real account balance;Real savings balance";

const OPTIONS = { currency: "EUR", year: 2026 };

describe("readSheetSummary", () => {
  it("reads a month named in words, with the year given by the caller", () => {
    const text = `${HEADER}\nJanuary;100,00;50,00;50,00;50,00;75,00;1 500,00`;

    expect(readSheetSummary(text, OPTIONS)).toEqual({
      months: [
        {
          month: "2026-01",
          net: 10_000,
          savings: 5_000,
          cumulativeSavings: 5_000,
          cumulativeAccount: 5_000,
          realAccountBalance: 7_500,
          savingsBalance: 150_000,
        },
      ],
      issues: [],
    });
  });

  it("reads French headers and month names, with or without accents", () => {
    const text =
      "Mois;Solde final;Épargne;Épargne cumulée;Compte cumulé;Compte réel;Épargne réelle\n" +
      "Février;100,00;50,00;50,00;50,00;75,00;1 500,00\n" +
      "aout;10,00;0,00;50,00;60,00;80,00;1 500,00";

    const result = readSheetSummary(text, OPTIONS);

    expect(result.months.map((entry) => entry.month)).toEqual([
      "2026-02",
      "2026-08",
    ]);
    expect(result.months[0]).toMatchObject({
      net: 10_000,
      savingsBalance: 150_000,
      realAccountBalance: 7_500,
    });
    expect(result.issues).toEqual([]);
  });

  it("reports a file it cannot read, with nothing else", () => {
    expect(readSheetSummary("", OPTIONS)).toEqual({
      months: [],
      issues: [{ kind: "emptyFile" }],
    });
  });

  it("reports every column it does not recognize and every figure it cannot find", () => {
    const result = readSheetSummary(
      "Month;Final balance;Notes\nJanuary;100,00;x",
      OPTIONS,
    );

    expect(result.issues).toEqual([
      { kind: "unrecognizedColumn", column: 2, header: "Notes" },
      { kind: "columnNotFound", column: "savings" },
      { kind: "columnNotFound", column: "cumulativeSavings" },
      { kind: "columnNotFound", column: "cumulativeAccount" },
      { kind: "columnNotFound", column: "savingsBalance" },
      { kind: "columnNotFound", column: "realAccountBalance" },
    ]);
    expect(result.months).toHaveLength(1);
  });

  it("reads nothing when the month column is missing", () => {
    const result = readSheetSummary(
      "Final balance;Savings\n100,00;50,00",
      OPTIONS,
    );

    expect(result.months).toEqual([]);
    expect(result.issues).toContainEqual({
      kind: "columnNotFound",
      column: "month",
    });
  });

  it("reads a month written with its own year, whatever the format", () => {
    const text = [
      HEADER,
      "2026-03;1,00;;;;;",
      "04/2026;2,00;;;;;",
      "May 2026;3,00;;;;;",
      "Juin 2025;4,00;;;;;",
    ].join("\n");

    const result = readSheetSummary(text, { currency: "EUR" });

    expect(result.months.map((entry) => entry.month)).toEqual([
      "2026-03",
      "2026-04",
      "2026-05",
      "2025-06",
    ]);
    expect(result.issues).toEqual([]);
  });

  it("reports a month without a year when none is given, and skips the row", () => {
    const result = readSheetSummary(`${HEADER}\nJanuary;1,00;;;;;`, {
      currency: "EUR",
    });

    expect(result.months).toEqual([]);
    expect(result.issues).toEqual([
      { kind: "monthYearMissing", line: 2, text: "January" },
    ]);
  });

  it("reports a row that is not a month, with its line, and keeps the others", () => {
    const result = readSheetSummary(
      `${HEADER}\nJanuary;1,00;;;;;\nTotal;9,00;;;;;\nFebruary;2,00;;;;;`,
      OPTIONS,
    );

    expect(result.months.map((entry) => entry.month)).toEqual([
      "2026-01",
      "2026-02",
    ]);
    expect(result.issues).toEqual([
      { kind: "monthUnreadable", line: 3, text: "Total" },
    ]);
  });

  it("reports two columns that name the same figure and keeps the first", () => {
    const result = readSheetSummary(
      "Month;Savings;Épargne\nJanuary;1,00;2,00",
      OPTIONS,
    );

    expect(result.issues).toContainEqual({
      kind: "ambiguousColumn",
      column: "savings",
      columns: [1, 2],
    });
    expect(result.months[0]?.savings).toBe(100);
  });

  it("reports an amount it cannot read, keeps the row and leaves the figure empty", () => {
    const result = readSheetSummary(
      `${HEADER}\nJanuary;abc;50,00;12,00 USD;0,00;;`,
      OPTIONS,
    );

    expect(result.months[0]).toMatchObject({
      net: null,
      savings: 5_000,
      cumulativeSavings: null,
      cumulativeAccount: 0,
    });
    expect(result.issues).toEqual([
      { kind: "amountUnreadable", line: 2, column: "net", text: "abc" },
      {
        kind: "amountUnreadable",
        line: 2,
        column: "cumulativeSavings",
        text: "12,00 USD",
      },
    ]);
  });

  it("keeps the months that are still empty, with empty figures and no issue", () => {
    const result = readSheetSummary(
      `${HEADER}\nJanuary;100,00;50,00;50,00;50,00;75,00;1 500,00\nNovember;;;;;;\nDecember;;;;;;`,
      OPTIONS,
    );

    expect(result.months.map((entry) => entry.month)).toEqual([
      "2026-01",
      "2026-11",
      "2026-12",
    ]);
    expect(result.months[1]).toEqual({
      month: "2026-11",
      net: null,
      savings: null,
      cumulativeSavings: null,
      cumulativeAccount: null,
      savingsBalance: null,
      realAccountBalance: null,
    });
    expect(result.issues).toEqual([]);
  });
});

describe("scopeSummary", () => {
  const month = (name: string): SummaryMonth => ({
    month: name,
    net: null,
    savings: null,
    cumulativeSavings: null,
    cumulativeAccount: null,
    savingsBalance: null,
    realAccountBalance: null,
  });
  const row = (date: string): SheetRow => ({
    source: "tab.csv",
    line: 2,
    date,
    label: "Shop",
    amount: 100,
    type: "expense",
    category: null,
    paymentMode: null,
  });
  const summary = ["2025-12", "2026-01", "2026-02", "2026-03", "2026-11"].map(month);

  it("keeps the months from the first to the last month of the rows", () => {
    const scope = scopeSummary(summary, [row("2026-01-15"), row("2026-03-02")]);

    expect(scope.inScope.map((entry) => entry.month)).toEqual([
      "2026-01",
      "2026-02",
      "2026-03",
    ]);
  });

  it("names the months it leaves out instead of dropping them silently", () => {
    const scope = scopeSummary(summary, [row("2026-01-15"), row("2026-03-02")]);

    expect(scope.ignored).toEqual(["2025-12", "2026-11"]);
  });

  it("leaves everything out, and says so, when there are no rows", () => {
    const scope = scopeSummary(summary, []);

    expect(scope.inScope).toEqual([]);
    expect(scope.ignored).toHaveLength(5);
  });

  it("does not let a row with an impossible date set the period", () => {
    const scope = scopeSummary(summary, [row("2026-02-10"), row("2099-13-45")]);

    expect(scope.inScope.map((entry) => entry.month)).toEqual(["2026-02"]);
  });
});
