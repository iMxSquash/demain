import { describe, expect, it } from "vitest";

import { readSheetTab } from "../../src/domain/sheet-tab";

const OPTIONS = { currency: "EUR", source: "january.csv" };

// Synthetic tab: the figures and labels are invented.
const COMPLETE_TAB = [
  "Date;Description;Amount;Type;Payment mode;Category",
  "13/01/2026;Carrefour;12,50;Expense;Card;Food",
  "14/01/2026;Salary;1 500,00;Income;Transfer;Pay",
  "15/01/2026;Livret;573,16;Savings;Transfer;Food",
  "16/01/2026;Landlord;700,00;Expense;Direct debit;Rent",
].join("\n");

describe("readSheetTab", () => {
  it("reads a complete tab into typed rows, the sign coming from the type", () => {
    const reading = readSheetTab(COMPLETE_TAB, OPTIONS);

    expect(reading.rows).toEqual([
      {
        source: "january.csv",
        line: 2,
        date: "2026-01-13",
        label: "Carrefour",
        amount: 1_250,
        type: "expense",
        category: "Food",
        paymentMode: "card",
      },
      {
        source: "january.csv",
        line: 3,
        date: "2026-01-14",
        label: "Salary",
        amount: 150_000,
        type: "income",
        category: "Pay",
        paymentMode: "transfer",
      },
      {
        source: "january.csv",
        line: 4,
        date: "2026-01-15",
        label: "Livret",
        amount: 57_316,
        type: "savings",
        category: null,
        paymentMode: "transfer",
      },
      {
        source: "january.csv",
        line: 5,
        date: "2026-01-16",
        label: "Landlord",
        amount: 70_000,
        type: "expense",
        category: "Rent",
        paymentMode: "direct_debit",
      },
    ]);
    expect(reading.issues).toEqual([]);
    expect(reading.source).toBe("january.csv");
  });

  it("skips and reports a row whose type is unknown or empty", () => {
    const reading = readSheetTab(
      [
        "Date;Description;Amount;Type",
        "13/01/2026;A;1,00;Expense",
        "14/01/2026;B;2,00;Refund",
        "15/01/2026;C;3,00;",
        "16/01/2026;D;4,00;Income",
        "17/01/2026;E;5,00;Expense",
      ].join("\n"),
      OPTIONS,
    );

    expect(reading.rows.map((row) => row.label)).toEqual(["A", "D", "E"]);
    expect(reading.issues).toEqual(
      expect.arrayContaining([
        { kind: "typeUnrecognized", line: 3, value: "Refund" },
        { kind: "typeMissing", line: 4 },
      ]),
    );
  });

  it("skips and reports an unreadable row with its line in the file, and keeps the others", () => {
    const reading = readSheetTab(
      [
        "Date;Description;Amount;Type",
        "13/01/2026;A;1,00;Expense",
        "31/02/2026;B;2,00;Expense",
        "15/01/2026;C;abc;Expense",
        "16/01/2026;;4,00;Expense",
        "17/01/2026;E;5,00;Expense",
      ].join("\n"),
      OPTIONS,
    );

    expect(reading.rows.map((row) => row.line)).toEqual([2, 6]);
    expect(
      reading.issues.flatMap((issue) =>
        issue.kind === "rowUnreadable" ? [issue.line] : [],
      ),
    ).toEqual([3, 4, 5]);
  });

  it("falls back on the sign of the amount without a type column, and says so", () => {
    const reading = readSheetTab(
      [
        "Date;Description;Amount",
        "13/01/2026;Shop;-12,50",
        "14/01/2026;Pay;100,00",
      ].join("\n"),
      OPTIONS,
    );

    expect(reading.rows.map((row) => [row.type, row.amount])).toEqual([
      ["expense", 1_250],
      ["income", 10_000],
    ]);
    expect(reading.issues).toContainEqual({
      kind: "columnNotFound",
      role: "type",
    });
  });

  it("reads every row as an expense when there is no type column and no amount is negative", () => {
    // Nothing says which way the money goes: the file is unsigned, so no row is an income by default.
    const reading = readSheetTab(
      [
        "Date;Description;Amount",
        "13/01/2026;Shop;12,50",
        "14/01/2026;Pay;100,00",
      ].join("\n"),
      OPTIONS,
    );

    expect(reading.rows.map((row) => [row.type, row.amount])).toEqual([
      ["expense", 1_250],
      ["expense", 10_000],
    ]);
  });

  it("lets the type cell win over a negative amount, without any issue", () => {
    const reading = readSheetTab(
      [
        "Date;Description;Amount;Type;Payment mode;Category",
        "13/01/2026;Refund;-12,50;Income;Card;Food",
        "14/01/2026;Shop;-3,00;Expense;Card;Food",
      ].join("\n"),
      OPTIONS,
    );

    expect(reading.rows.map((row) => [row.type, row.amount])).toEqual([
      ["income", 1_250],
      ["expense", 300],
    ]);
    expect(reading.issues).toEqual([]);
  });

  it("takes the type from the debit and credit columns without a type column, and skips no row", () => {
    const reading = readSheetTab(
      [
        "Date;Description;Debit;Credit",
        "13/01/2026;Shop;12,50;",
        "14/01/2026;Pay;;100,00",
      ].join("\n"),
      OPTIONS,
    );

    expect(reading.rows.map((row) => [row.type, row.amount])).toEqual([
      ["expense", 1_250],
      ["income", 10_000],
    ]);
    // The missing type column is reported, but no row is.
    expect(reading.issues).toContainEqual({ kind: "columnNotFound", role: "type" });
    const kinds = reading.issues.map((issue) => issue.kind);
    expect(kinds).not.toContain("typeMissing");
    expect(kinds).not.toContain("typeUnrecognized");
  });

  it("reads nothing when the essential columns are not found, and reports each", () => {
    const reading = readSheetTab("a;b;c\n1;2;3", OPTIONS);

    expect(reading.rows).toEqual([]);
    expect(reading.issues).toContainEqual({
      kind: "mappingColumnNotFound",
      role: "date",
    });
  });

  it("reports a file it cannot read, with nothing else", () => {
    expect(readSheetTab("", OPTIONS).issues).toEqual([{ kind: "emptyFile" }]);
  });

  it("keeps the category out of the type: it is decided by the type column, the sign or nothing", () => {
    // A salary category would make an income elsewhere; the migration has never read it that way.
    const reading = readSheetTab(
      "Date;Description;Amount;Category\n13/01/2026;Virement;1500,00;Salaire\n14/01/2026;Livret;50,00;Epargne",
      OPTIONS,
    );

    expect(reading.rows.map((row) => row.type)).toEqual(["expense", "expense"]);
  });

  describe("a row with no description", () => {
    const TAB = [
      "Date;Description;Amount;Type;Payment mode;Category",
      "13/01/2026;Carrefour;12,50;Expense;Card;Food",
      "14/01/2026;;30,00;Expense;Card;Food",
      "15/01/2026;;573,16;Savings;Transfer;Savings",
      "16/01/2026;;5,00;Expense;Card;",
    ].join("\n");

    it("takes its category as label, and reports the row to read", () => {
      const reading = readSheetTab(TAB, OPTIONS);

      expect(reading.rows[1]).toMatchObject({
        line: 3,
        label: "Food",
        category: "Food",
      });
      expect(reading.issues).toContainEqual({
        kind: "labelFromCategory",
        line: 3,
        category: "Food",
      });
    });

    it("still gives a savings row no category, whatever stands for its label", () => {
      const reading = readSheetTab(TAB, OPTIONS);

      expect(reading.rows[2]).toMatchObject({
        line: 4,
        label: "Savings",
        type: "savings",
        category: null,
      });
    });

    it("skips the row that has no category either", () => {
      const reading = readSheetTab(TAB, OPTIONS);

      expect(reading.rows.map((row) => row.line)).toEqual([2, 3, 4]);
      expect(reading.issues).toContainEqual(
        expect.objectContaining({ kind: "rowUnreadable", line: 5 }),
      );
    });

    it("lists the issues of the rows in the order of the file", () => {
      const reading = readSheetTab(TAB, OPTIONS);

      expect(
        reading.issues.flatMap((issue) =>
          "line" in issue && issue.line !== null ? [issue.line] : [],
        ),
      ).toEqual([3, 4, 5]);
    });
  });

  describe("a file with lines above its header", () => {
    const PREAMBLE_TAB = [
      "Compte;Courant",
      "Solde au 31/01/2026;1 234,56",
      "Date;Description;Amount;Type",
      "13/01/2026;Carrefour;12,50;Expense",
      "14/01/2026;Gift;5,00;Refund",
      "Total;;17,50;",
    ].join("\n");

    it("reads the rows below it, with the lines of the file", () => {
      const reading = readSheetTab(PREAMBLE_TAB, OPTIONS);

      expect(reading.rows.map((row) => [row.line, row.label])).toEqual([
        [4, "Carrefour"],
      ]);
      // The lines above the header and the total are no unreadable rows.
      expect(reading.issues.map((issue) => issue.kind)).not.toContain(
        "rowUnreadable",
      );
      expect(reading.issues).toContainEqual({
        kind: "typeUnrecognized",
        line: 5,
        value: "Refund",
      });
      expect(reading.issues).toContainEqual({
        kind: "rowsIgnored",
        reason: "total",
        lines: [6],
      });
    });
  });

  describe("dates written without a year", () => {
    const YEARLESS_TAB = [
      "Date;Description;Amount;Type",
      "13/01;Carrefour;12,50;Expense",
      "14/01;Salary;100,00;Income",
    ].join("\n");

    it("uses the year the caller gives, and has nothing to ask", () => {
      const reading = readSheetTab(YEARLESS_TAB, { ...OPTIONS, year: 2026 });

      expect(reading.rows.map((row) => row.date)).toEqual([
        "2026-01-13",
        "2026-01-14",
      ]);
      expect(reading.issues.filter((issue) => issue.kind.startsWith("dateYear"))).toEqual([]);
    });

    it("takes the year from the file name, and asks to confirm it", () => {
      const reading = readSheetTab(YEARLESS_TAB, {
        ...OPTIONS,
        source: "january-2026.csv",
      });

      expect(reading.rows.map((row) => row.date)).toEqual([
        "2026-01-13",
        "2026-01-14",
      ]);
      expect(reading.issues).toContainEqual({ kind: "dateYearAssumed", year: 2026 });
    });

    it("prefers the year the caller gives to the one in the file name", () => {
      const reading = readSheetTab(YEARLESS_TAB, {
        ...OPTIONS,
        source: "january-2025.csv",
        year: 2026,
      });

      expect(reading.rows[0]?.date).toBe("2026-01-13");
      expect(reading.issues.filter((issue) => issue.kind.startsWith("dateYear"))).toEqual([]);
    });

    it.each(["january.csv", "2025-2026.csv", "tab-20260.csv"])(
      "reads no row and asks for the year when %s does not give one",
      (source) => {
        const reading = readSheetTab(YEARLESS_TAB, { ...OPTIONS, source });

        expect(reading.rows).toEqual([]);
        expect(reading.issues).toContainEqual({ kind: "dateYearMissing" });
        expect(reading.issues.map((issue) => issue.kind)).not.toContain("rowUnreadable");
      },
    );

    it("does not touch the dates that carry a year, whatever the file name says", () => {
      const reading = readSheetTab(COMPLETE_TAB, {
        ...OPTIONS,
        source: "january-2025.csv",
      });

      expect(reading.rows[0]?.date).toBe("2026-01-13");
      expect(reading.issues.filter((issue) => issue.kind.startsWith("dateYear"))).toEqual([]);
    });
  });
});
