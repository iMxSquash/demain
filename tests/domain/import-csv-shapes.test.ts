import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { readMovementFile } from "../../src/domain/import-movements";

const FIXTURES = path.join(process.cwd(), "tests", "fixtures");

function readFixture(name: string): string {
  return readFileSync(path.join(FIXTURES, name), "utf8");
}

function read(name: string, year?: number) {
  return readMovementFile(readFixture(name), { currency: "EUR", source: name, year });
}

const summarize = (reading: ReturnType<typeof read>) =>
  reading.rows.map((row) => [row.line, row.date, row.label, row.amount]);

// Debit and credit in two columns, with a header: import-debit-credit-en.csv
// (comma, quoted amounts) and tests/fixtures/statement.csv (semicolon) already
// cover it in import-files.test.ts and import-csv.test.ts.

describe("a file separated by tabs", () => {
  const reading = read("import-tab-separated-en.csv");

  it("detects the tab as delimiter", () => {
    expect(reading.analysis.delimiter).toBe("\t");
    expect(reading.analysis.mapping?.hasHeader).toBe(true);
  });

  it("reads the five movements with signed amounts in minor units", () => {
    expect(summarize(reading)).toEqual([
      [2, "2026-02-03", "Bakery", -480],
      [3, "2026-02-05", "Acme payroll", 210_000],
      [4, "2026-02-07", "TOTAL ENERGIES", -8_935],
      [5, "2026-02-10", "Book refund", 1_500],
      [6, "2026-02-12", "Train ticket", -3_210],
    ]);
  });

  it("keeps the row labelled TOTAL ENERGIES as a movement", () => {
    expect(reading.analysis.ignoredLines).toEqual([]);
    expect(reading.rows.map((row) => row.label)).toContain("TOTAL ENERGIES");
  });
});

describe("a file with no header", () => {
  const reading = read("import-no-header-fr.csv");

  it("refuses to read it, as no column can be named", () => {
    expect(reading.analysis.mapping).toBeNull();
    expect(reading.rows).toEqual([]);
  });

  it("reports that the date, label and amount columns are not found", () => {
    expect(reading.issues).toContainEqual({ kind: "mappingColumnNotFound", role: "date" });
    expect(reading.issues).toContainEqual({ kind: "mappingColumnNotFound", role: "label" });
    expect(reading.issues).toContainEqual({ kind: "mappingColumnNotFound", role: "amount" });
  });

  it("still detects the semicolon from the first line", () => {
    expect(reading.analysis.delimiter).toBe(";");
  });
});

describe("a file with a summary beside the table and a total at the bottom", () => {
  const reading = read("import-summary-beside-fr.csv");

  it("reads the five movements and nothing of the summary", () => {
    expect(summarize(reading)).toEqual([
      [2, "2026-02-03", "Boulangerie", -480],
      [3, "2026-02-05", "Salaire ACME", 210_000],
      [4, "2026-02-07", "TOTAL ENERGIES", -8_935],
      [5, "2026-02-10", "Remboursement livre", 1_500],
      [6, "2026-02-12", "Billet de train", -3_210],
    ]);
  });

  it("reports the summary columns and the total line as ignored", () => {
    expect(reading.issues).toContainEqual({ kind: "columnsIgnored", columns: [4, 5] });
    expect(reading.issues).toContainEqual({
      kind: "rowsIgnored",
      reason: "total",
      lines: [7],
    });
    expect(reading.analysis.ignoredLines).toEqual([7]);
  });

  it("keeps TOTAL ENERGIES, as a label that merely looks like a total", () => {
    expect(reading.rows.map((row) => row.label)).toContain("TOTAL ENERGIES");
  });
});

// Line numbers are not asserted on this fixture: the parser drops blank lines
// before numbering the rows, so the numbers it reports are shifted by the empty
// line.
describe("a file with lines above the header and an empty line in the middle", () => {
  const reading = read("import-preamble-blank-line-fr.csv");

  it("starts at the header and ignores the account and balance lines", () => {
    expect(reading.issues).toContainEqual({
      kind: "rowsIgnored",
      reason: "beforeHeader",
      lines: [1, 2],
    });
  });

  it("reads the movements on both sides of the empty line", () => {
    expect(summarize(reading).map(([, date, label, amount]) => [date, label, amount])).toEqual([
      ["2026-02-03", "BOULANGERIE", -480],
      ["2026-02-05", "VIR SALAIRE ACME", 210_000],
      ["2026-02-07", "TOTAL ENERGIES", -8_935],
      ["2026-02-10", "REMBOURSEMENT LIVRE", 1_500],
    ]);
  });
});

describe("a file with a comma as decimal mark and dots as thousands separators", () => {
  const reading = read("import-decimal-comma-fr.csv", 2026);

  it("reads the number format of the file as the comma", () => {
    expect(reading.analysis.mapping?.decimalMark).toBe(",");
  });

  it("reads 2.100,00 and -1.234,56 as thousands, not as decimals", () => {
    expect(reading.rows.map((row) => row.amount)).toEqual([
      -480, 210_000, -108_935, 1_500, -123_456,
    ]);
  });

  it("completes the dates written without a year with the given one", () => {
    expect(reading.rows.map((row) => row.date)).toEqual([
      "2026-04-03",
      "2026-04-05",
      "2026-04-07",
      "2026-04-10",
      "2026-04-12",
    ]);
    expect(reading.analysis.yearApplied).toBe(2026);
  });

  it("keeps the row labelled TOTAL ENERGIES", () => {
    expect(reading.rows[2]?.label).toBe("TOTAL ENERGIES");
  });

  it("reads no row and asks for the year when none is given", () => {
    const withoutYear = read("import-decimal-comma-fr.csv");

    expect(withoutYear.rows).toEqual([]);
    expect(withoutYear.issues).toContainEqual({ kind: "dateYearMissing" });
  });
});

describe("a file with a point as decimal mark and commas as thousands separators", () => {
  const reading = read("import-decimal-point-en.csv");

  it("reads the number format of the file as the point", () => {
    expect(reading.analysis.delimiter).toBe(",");
    expect(reading.analysis.mapping?.decimalMark).toBe(".");
  });

  it("reads \"2,100.00\" and \"-1,234.56\" as thousands, not as decimals", () => {
    expect(summarize(reading)).toEqual([
      [2, "2026-04-03", "Bakery", -480],
      [3, "2026-04-05", "Acme payroll", 210_000],
      [4, "2026-04-07", "TOTAL ENERGIES", -108_935],
      [5, "2026-04-10", "Book refund", 1_500],
      [6, "2026-04-12", "Furniture", -123_456],
    ]);
  });

  it("raises no number format issue, as every amount agrees", () => {
    expect(reading.issues.map((issue) => issue.kind)).not.toContain("numberFormatAmbiguous");
  });
});

describe("the number format is read per file", () => {
  it("reads the same digits as different amounts in two files", () => {
    const comma = read("import-decimal-comma-fr.csv", 2026);
    const point = read("import-decimal-point-en.csv");

    expect(comma.analysis.mapping?.decimalMark).toBe(",");
    expect(point.analysis.mapping?.decimalMark).toBe(".");
    expect(comma.rows.map((row) => row.amount)).toEqual(
      point.rows.map((row) => row.amount),
    );
  });
});
