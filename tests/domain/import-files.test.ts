import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { readMovementFile } from "../../src/domain/import-movements";
import { readSheetTab } from "../../src/domain/sheet-tab";

const FIXTURES = path.join(process.cwd(), "tests", "fixtures");

function readFixture(name: string): string {
  return readFileSync(path.join(FIXTURES, name), "utf8");
}

describe("a monthly tab of the sheet, with a summary beside it", () => {
  const text = readFixture("import-sheet-tab-fr.csv");
  const options = { currency: "EUR", source: "import-sheet-tab-fr.csv" };

  it("reads the five movements and nothing of the summary or the total", () => {
    const reading = readMovementFile(text, options);

    expect(
      reading.rows.map((row) => [
        row.line,
        row.label,
        row.amount,
        row.type.type,
        row.category,
        row.paymentMode,
      ]),
    ).toEqual([
      [2, "Carrefour", 1_250, "expense", "Courses", "card"],
      [3, "Salaire ACME", 150_000, "income", "Salaire", "transfer"],
      [4, "Loyer", 70_000, "expense", "Logement", "direct_debit"],
      [5, "Courses", 2_490, "expense", "Courses", "card"],
      [6, "Livret", 57_316, "savings", "Épargne", "transfer"],
    ]);
    expect(reading.rows[3]?.labelFromCategory).toBe(true);
  });

  it("reports the summary columns and the total line, and nothing else", () => {
    const reading = readMovementFile(text, options);

    expect(reading.issues).toEqual([
      { kind: "columnsIgnored", columns: [7, 8] },
      { kind: "rowsIgnored", reason: "total", lines: [7] },
    ]);
    expect(reading.analysis.typeColumn).toBe(3);
  });

  it("is read by the migration with its strict policy and the same types", () => {
    const reading = readSheetTab(text, options);

    expect(reading.rows.map((row) => [row.line, row.type, row.amount, row.category])).toEqual([
      [2, "expense", 1_250, "Courses"],
      [3, "income", 150_000, "Salaire"],
      [4, "expense", 70_000, "Logement"],
      [5, "expense", 2_490, "Courses"],
      [6, "savings", 57_316, null],
    ]);
    expect(reading.issues).toContainEqual({
      kind: "labelFromCategory",
      line: 5,
      category: "Courses",
    });
  });
});

describe("an English export with debit and credit columns", () => {
  const reading = readMovementFile(readFixture("import-debit-credit-en.csv"), {
    currency: "EUR",
    source: "import-debit-credit-en.csv",
  });

  it("reads the amounts in quotes with the point as decimal mark", () => {
    expect(reading.analysis.delimiter).toBe(",");
    expect(reading.analysis.mapping?.decimalMark).toBe(".");
    expect(reading.rows.map((row) => [row.label, row.amount])).toEqual([
      ["Corner shop", -1_250],
      ["Acme payroll", 123_456],
      ["Landlord", -125_000],
      ["Cinema", -900],
    ]);
  });

  it("takes the Type column for the payment mode, as it holds modes", () => {
    expect(reading.analysis.typeColumn).toBeNull();
    expect(reading.analysis.paymentModeColumn).toBe(4);
    expect(reading.rows.map((row) => row.paymentMode)).toEqual([
      "card",
      "transfer",
      "direct_debit",
      "card",
    ]);
    expect(reading.issues).toEqual([{ kind: "columnNotFound", role: "type" }]);
  });

  it("reads the category and the notes, and guesses the type from the columns and the category", () => {
    expect(reading.rows.map((row) => [row.category, row.description])).toEqual([
      ["Groceries", "weekly shop"],
      ["Salary", "January"],
      ["Rent", null],
      ["Leisure", null],
    ]);
    expect(reading.rows.map((row) => [row.type.type, row.type.confidence])).toEqual([
      ["expense", "medium"],
      ["income", "medium"],
      ["expense", "medium"],
      ["expense", "medium"],
    ]);
    expect(reading.rows[1]?.type.evidence).toMatchObject({
      kind: "categoryWord",
      word: "salary",
    });
  });
});

describe("an export with lines above the header", () => {
  const reading = readMovementFile(readFixture("import-preamble-fr.csv"), {
    currency: "EUR",
    source: "import-preamble-fr.csv",
  });

  it("starts at the header and keeps the lines of the file", () => {
    expect(reading.analysis.headerIndex).toBe(2);
    expect(reading.issues).toContainEqual({
      kind: "rowsIgnored",
      reason: "beforeHeader",
      lines: [1, 2],
    });
    expect(reading.rows.map((row) => [row.line, row.date, row.label])).toEqual([
      [4, "2026-01-15", "CARTE SHOP PARIS"],
      [5, "2026-01-20", "VIR SALAIRE ACME"],
      [6, "2026-01-28", "REGUL FRAIS"],
    ]);
  });

  it("reads 1.234 as a thousand, as the file writes decimals with a comma", () => {
    expect(reading.analysis.mapping?.decimalMark).toBe(",");
    expect(reading.rows.map((row) => row.amount)).toEqual([-1_250, 114_388, 123_400]);
  });

  it("takes the detail of the entry for the description, not for the label", () => {
    expect(reading.rows.map((row) => row.description)).toEqual([
      "Achat du 14/01",
      "Paie janvier",
      "Régularisation",
    ]);
  });
});

describe("an export with a type column and signed amounts", () => {
  const reading = readMovementFile(readFixture("import-typed-signed.csv"), {
    currency: "EUR",
    source: "import-typed-signed.csv",
  });

  it("takes the type of each row from its cell", () => {
    expect(reading.rows.map((row) => row.type.type)).toEqual([
      "expense",
      "income",
      "income",
      "savings",
    ]);
  });

  it("flags the income with a negative amount, keeping the sign as the conflict", () => {
    expect(reading.rows.map((row) => row.type.confidence)).toEqual([
      "high",
      "high",
      "low",
      "high",
    ]);
    expect(reading.rows[2]?.type.conflict).toEqual({ kind: "sign", direction: "out" });
    expect(reading.rows[2]?.amount).toBe(-4_500);
  });
});

describe("an export with savings in both directions", () => {
  const reading = readMovementFile(readFixture("import-savings-signed-fr.csv"), {
    currency: "EUR",
    source: "import-savings-signed-fr.csv",
  });

  it("reads the money coming back from savings as savings, not as an income to confirm", () => {
    expect(
      reading.rows.map((row) => [row.date, row.amount, row.type.type, row.type.confidence]),
    ).toEqual([
      ["2026-03-10", -30_000, "savings", "medium"],
      ["2026-03-15", -4_520, "expense", "medium"],
      ["2026-03-20", 5_000, "savings", "medium"],
      ["2026-03-25", 150_000, "income", "medium"],
    ]);
    expect(reading.rows[2]?.type.conflict).toBeNull();
  });
});
