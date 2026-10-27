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
      },
      typeColumn: 3,
      paymentModeColumn: 4,
      categoryColumn: 5,
      yearApplied: null,
      issues: [],
    });
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
});
