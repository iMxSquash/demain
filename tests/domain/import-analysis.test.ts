import { describe, expect, it } from "vitest";

import { analyzeCsv } from "../../src/domain/import-analysis";

const COMPLETE_FILE = [
  "Date;Description;Amount;Type;Payment mode;Category",
  "13/02/2026;Carrefour;-12,50;Expense;Card;Food",
  "14/02/2026;Landlord;-700,00;Expense;Transfer;Rent",
  "15/02/2026;Auchan;-30,00;Expense;Card;Food",
].join("\n");

describe("analyzeCsv", () => {
  it("understands a complete file and reports nothing", () => {
    expect(analyzeCsv(COMPLETE_FILE)).toEqual({
      delimiter: ";",
      mapping: {
        delimiter: ";",
        hasHeader: true,
        dateColumn: 0,
        dateFormat: "dmy",
        labelColumn: 1,
        amount: { kind: "single", column: 2 },
        decimalMark: ",",
      },
      headerIndex: 0,
      ignoredLines: [],
      typeColumn: 3,
      paymentModeColumn: 4,
      categoryColumn: 5,
      descriptionColumn: null,
      yearApplied: null,
      issues: [],
    });
  });

  it("reads the roles the headers name, in French as well", () => {
    const analysis = analyzeCsv(
      [
        "Date;Libellé;Montant;Type;Mode de paiement;Catégorie;Notes",
        "13/02/2026;Carrefour;-12,50;Dépense;CB;Courses;semaine 7",
        "14/02/2026;Salaire;1500,00;Revenu;VIR;Paie;",
      ].join("\n"),
    );

    expect(analysis).toMatchObject({
      typeColumn: 3,
      paymentModeColumn: 4,
      categoryColumn: 5,
      descriptionColumn: 6,
    });
    expect(analysis.issues).toEqual([]);
  });

  it("reports each essential column that no header names", () => {
    const analysis = analyzeCsv("a;b;c\n1;2;3\n4;5;6");

    expect(analysis.mapping).toBeNull();
    expect(analysis.issues.slice(0, 3)).toEqual([
      { kind: "mappingColumnNotFound", role: "date" },
      { kind: "mappingColumnNotFound", role: "label" },
      { kind: "mappingColumnNotFound", role: "amount" },
    ]);
  });

  it("reports only the essential column that is missing", () => {
    const analysis = analyzeCsv(
      "Date;Description;Notes\n13/02/2026;Carrefour;x\n14/02/2026;Auchan;y",
    );

    expect(analysis.mapping).toBeNull();
    expect(analysis.issues).toContainEqual({
      kind: "mappingColumnNotFound",
      role: "amount",
    });
    expect(analysis.issues).not.toContainEqual({
      kind: "mappingColumnNotFound",
      role: "date",
    });
  });

  it("flags a date format that is only the likeliest guess", () => {
    const analysis = analyzeCsv(
      "Date;Description;Amount\n03/04/2026;Carrefour;-12,50\n01/02/2026;Auchan;-30,00",
    );

    expect(analysis.mapping?.dateFormat).toBe("dmy");
    expect(analysis.issues).toContainEqual({
      kind: "dateFormatAmbiguous",
      format: "dmy",
    });
  });

  it("reports dates that no format reads, and still proposes a mapping", () => {
    const analysis = analyzeCsv(
      "Date;Description;Amount\n13/02/2026;Carrefour;-12,50\n02/13/2026;Auchan;-30,00",
    );

    expect(analysis.mapping).not.toBeNull();
    expect(analysis.issues).toContainEqual({ kind: "dateFormatNotFound" });
  });

  it("does not look for a date format without a date column", () => {
    const analysis = analyzeCsv("a;b;c\n1;2;3");

    expect(analysis.issues).not.toContainEqual({ kind: "dateFormatNotFound" });
  });

  it("reports an empty file as the only issue", () => {
    expect(analyzeCsv("").issues).toEqual([{ kind: "emptyFile" }]);
    expect(analyzeCsv("\n\n").issues).toEqual([{ kind: "emptyFile" }]);
  });

  it("reports a file it cannot read instead of throwing", () => {
    const analysis = analyzeCsv('a;"b\n1;2');

    expect(analysis.mapping).toBeNull();
    expect(analysis.issues).toHaveLength(1);
    expect(analysis.issues[0]).toMatchObject({
      kind: "unreadableFile",
      line: 1,
    });
  });

  it("reports a file where no separator is found as the only issue", () => {
    expect(analyzeCsv("Date\n13/02/2026\n14/02/2026").issues).toEqual([
      { kind: "delimiterNotFound" },
    ]);
  });

  describe("with a delimiter chosen by the user", () => {
    const COMMA_FILE =
      "Date,Description,Amount\n13/02/2026,Carrefour,-12.50\n14/02/2026,Auchan,-30.00";

    it("uses it instead of the detected one", () => {
      const analysis = analyzeCsv(COMMA_FILE, ";");

      expect(analysis.delimiter).toBe(";");
      expect(analysis.mapping).toBeNull();
      expect(analysis.issues).toEqual([{ kind: "delimiterNotFound" }]);
    });

    it("reads the file with it when it splits the rows", () => {
      const analysis = analyzeCsv(COMMA_FILE, ",");

      expect(analysis.delimiter).toBe(",");
      expect(analysis.mapping?.delimiter).toBe(",");
      expect(analysis.issues).not.toContainEqual({ kind: "delimiterNotFound" });
    });
  });

  describe("dates written without a year", () => {
    const YEARLESS_FILE =
      "Date;Description;Amount\n13/01;Carrefour;-12,50\n14/01;Auchan;-30,00";

    it("asks for the year instead of guessing one, and still proposes a mapping", () => {
      const analysis = analyzeCsv(YEARLESS_FILE);

      expect(analysis.mapping).not.toBeNull();
      expect(analysis.yearApplied).toBeNull();
      expect(analysis.issues).toContainEqual({ kind: "dateYearMissing" });
      expect(analysis.issues).not.toContainEqual({ kind: "dateFormatNotFound" });
    });

    it("reads the dates with the year it is given", () => {
      const analysis = analyzeCsv(YEARLESS_FILE, undefined, 2026);

      expect(analysis.yearApplied).toBe(2026);
      expect(analysis.mapping?.dateFormat).toBe("dmy");
      expect(analysis.issues).not.toContainEqual({ kind: "dateYearMissing" });
      expect(analysis.issues).not.toContainEqual({ kind: "dateFormatNotFound" });
    });

    it("still flags a day-month order that cannot be told", () => {
      const analysis = analyzeCsv(
        "Date;Description;Amount\n03/04;A;-1,00\n01/02;B;-2,00",
        undefined,
        2026,
      );

      expect(analysis.issues).toContainEqual({
        kind: "dateFormatAmbiguous",
        format: "dmy",
      });
    });

    it("ignores the year when the dates carry their own", () => {
      const analysis = analyzeCsv(
        "Date;Description;Amount\n13/01/2025;A;-1,00",
        undefined,
        2026,
      );

      expect(analysis.yearApplied).toBeNull();
    });

    it("does not read a mix of dates with and without a year", () => {
      const analysis = analyzeCsv(
        "Date;Description;Amount\n13/01;A;-1,00\n14/01/2026;B;-2,00",
        undefined,
        2026,
      );

      expect(analysis.issues).toContainEqual({ kind: "dateFormatNotFound" });
    });
  });
  describe("lines above the header", () => {
    const PREAMBLE_FILE = [
      "Compte;Synthétique;",
      "Solde au 31/01/2026;1 234,56",
      "Date;Libellé;Montant",
      "13/02/2026;Carrefour;-12,50",
      "14/02/2026;Auchan;-30,00",
    ].join("\n");

    it("finds the header below them and reports them", () => {
      const analysis = analyzeCsv(PREAMBLE_FILE);

      expect(analysis.headerIndex).toBe(2);
      expect(analysis.ignoredLines).toEqual([1, 2]);
      expect(analysis.mapping).toMatchObject({
        dateColumn: 0,
        labelColumn: 1,
        amount: { kind: "single", column: 2 },
      });
      expect(analysis.issues).toContainEqual({
        kind: "rowsIgnored",
        reason: "beforeHeader",
        lines: [1, 2],
      });
    });

    it("numbers the lines of the roles from the file, not from the header", () => {
      const analysis = analyzeCsv(
        [
          "Compte;Synthétique;;",
          "Date;Libellé;Montant;Type",
          "13/02/2026;Carrefour;-12,50;Dépense",
          "14/02/2026;Cadeau;-5,00;Remboursement",
          "15/02/2026;Auchan;-30,00;Dépense",
          "16/02/2026;Salaire;1500,00;Revenu",
          "17/02/2026;Loyer;-700,00;Dépense",
        ].join("\n"),
      );

      expect(analysis.issues).toContainEqual({
        kind: "unrecognizedValue",
        role: "type",
        value: "Remboursement",
        lines: [4],
      });
    });

    it("does not report any when the header is the first line", () => {
      const kinds = analyzeCsv(COMPLETE_FILE).issues.map((issue) => issue.kind);

      expect(kinds).not.toContain("rowsIgnored");
    });
  });

  describe("a block beside the table", () => {
    const SUMMARY_BESIDE = [
      "Date;Description;Amount;Type;;Summary;",
      "13/02/2026;Carrefour;12,50;Expense;;Income;1500,00",
      "14/02/2026;Salary;100,00;Income;;Expense;112,50",
      ";;;;;Savings;0,00",
    ].join("\n");

    it("leaves it out and reports its columns", () => {
      const analysis = analyzeCsv(SUMMARY_BESIDE);

      expect(analysis.issues).toContainEqual({
        kind: "columnsIgnored",
        columns: [5, 6],
      });
    });

    it("does not take its cells for a second type column", () => {
      const analysis = analyzeCsv(SUMMARY_BESIDE);

      expect(analysis.typeColumn).toBe(3);
      expect(analysis.issues.map((issue) => issue.kind)).not.toContain(
        "ambiguousColumn",
      );
    });

    it("skips the lines that hold only the block, without reporting them", () => {
      const analysis = analyzeCsv(SUMMARY_BESIDE);

      expect(analysis.ignoredLines).toEqual([4]);
      expect(analysis.issues.map((issue) => issue.kind)).not.toContain(
        "rowsIgnored",
      );
      expect(analysis.issues.map((issue) => issue.kind)).not.toContain(
        "dateFormatNotFound",
      );
    });

    it("does not take a category from the block", () => {
      const analysis = analyzeCsv(
        [
          "Date;Description;Amount;;Category;Count",
          "13/02/2026;Carrefour;12,50;;Food;3",
          "14/02/2026;Salary;100,00;;Pay;1",
        ].join("\n"),
      );

      expect(analysis.categoryColumn).toBeNull();
      expect(analysis.issues).toContainEqual({
        kind: "columnsIgnored",
        columns: [4, 5],
      });
    });

    it("reports nothing when the whole file is one table", () => {
      const kinds = analyzeCsv(COMPLETE_FILE).issues.map((issue) => issue.kind);

      expect(kinds).not.toContain("columnsIgnored");
    });

    it("keeps every column when the essential ones are on both sides of an empty one", () => {
      const analysis = analyzeCsv(
        [
          "Date;Description;;Amount;Type",
          "13/02/2026;Carrefour;;12,50;Expense",
          "14/02/2026;Salary;;100,00;Income",
        ].join("\n"),
      );

      expect(analysis.typeColumn).toBe(4);
      expect(analysis.issues.map((issue) => issue.kind)).not.toContain(
        "columnsIgnored",
      );
    });
  });

  describe("total rows", () => {
    it("skips them and reports their lines, so that the dates are still read", () => {
      const analysis = analyzeCsv(
        [
          "Date;Description;Amount",
          "13/02/2026;Carrefour;-12,50",
          "14/02/2026;Auchan;-30,00",
          "Total;;-42,50",
        ].join("\n"),
      );

      expect(analysis.ignoredLines).toEqual([4]);
      expect(analysis.issues).toContainEqual({
        kind: "rowsIgnored",
        reason: "total",
        lines: [4],
      });
      expect(analysis.issues).not.toContainEqual({ kind: "dateFormatNotFound" });
    });

    it("keeps a dated row whose label starts with a total word", () => {
      const analysis = analyzeCsv(
        [
          "Date;Description;Amount",
          "13/02/2026;TOTAL ENERGIES;-12,50",
          "14/02/2026;Auchan;-30,00",
        ].join("\n"),
      );

      expect(analysis.ignoredLines).toEqual([]);
    });

    it("still asks for the year of dates written without one", () => {
      const file = "Date;Description;Amount\n13/01;A;-1,00\nSolde;;-1,00";

      expect(analyzeCsv(file).issues).toContainEqual({ kind: "dateYearMissing" });
      expect(analyzeCsv(file, undefined, 2026)).toMatchObject({
        yearApplied: 2026,
        ignoredLines: [3],
      });
    });

    it("reports the lines above the header, then the total lines, in that order", () => {
      const analysis = analyzeCsv(
        [
          "Compte;Courant",
          "Date;Description;Amount",
          "13/02/2026;Carrefour;-12,50",
          "Total;;-12,50",
        ].join("\n"),
      );

      expect(analysis.ignoredLines).toEqual([1, 4]);
    });
  });

  describe("the number format", () => {
    it("reads the comma of a French file", () => {
      expect(analyzeCsv(COMPLETE_FILE).mapping?.decimalMark).toBe(",");
    });

    it("reads the point of an English file, with thousands separators", () => {
      const analysis = analyzeCsv(
        'Date,Description,Amount\n13/02/2026,Carrefour,"-1,234.56"\n14/02/2026,Auchan,"-30.00"',
      );

      expect(analysis.mapping?.decimalMark).toBe(".");
      expect(analysis.issues.map((issue) => issue.kind)).not.toContain(
        "numberFormatAmbiguous",
      );
    });

    it("reads the amounts of the debit and credit columns", () => {
      const analysis = analyzeCsv(
        'Date,Description,Debit,Credit\n13/02/2026,Carrefour,"1,234.56",\n14/02/2026,Salary,,"100.00"',
      );

      expect(analysis.mapping?.decimalMark).toBe(".");
    });

    it("leaves it out when no amount tells, such as whole amounts", () => {
      const analysis = analyzeCsv(
        "Date;Description;Amount\n13/02/2026;Carrefour;-12\n14/02/2026;Auchan;-1 500",
      );

      expect(analysis.mapping).not.toBeNull();
      expect(analysis.mapping?.decimalMark).toBeUndefined();
    });

    it("goes with the majority of a file that mixes both, and asks to check it", () => {
      const analysis = analyzeCsv(
        [
          "Date;Description;Amount",
          "13/02/2026;A;-12,50",
          "14/02/2026;B;-30,50",
          "15/02/2026;C;-3.50",
        ].join("\n"),
      );

      expect(analysis.mapping?.decimalMark).toBe(",");
      expect(analysis.issues).toContainEqual({
        kind: "numberFormatAmbiguous",
        mark: ",",
      });
    });

    it("does not count the amounts of the lines it skips", () => {
      const analysis = analyzeCsv(
        [
          "Date;Description;Amount",
          "13/02/2026;A;-12,50",
          "Total;;1.5",
        ].join("\n"),
      );

      expect(analysis.issues.map((issue) => issue.kind)).not.toContain(
        "numberFormatAmbiguous",
      );
    });
  });
});
