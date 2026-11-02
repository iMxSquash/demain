import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import type { CsvMapping } from "../../src/domain/import-csv";
import { stageCsvRows, stageMovementFile } from "../../src/domain/import-staging";

const SINGLE: CsvMapping = {
  delimiter: ";",
  hasHeader: true,
  dateColumn: 0,
  dateFormat: "dmy",
  labelColumn: 1,
  amount: { kind: "single", column: 2 },
};

const SPLIT: CsvMapping = {
  ...SINGLE,
  amount: { kind: "split", debitColumn: 2, creditColumn: 3 },
};

describe("stageCsvRows", () => {
  it("turns each readable row into an editable draft numbered by its line in the file", () => {
    const table = [
      ["Date", "Label", "Amount"],
      ["01/02/2026", "SHOP", "-12,50"],
      ["05/02/2026", "SALARY", "1 143,88"],
    ];

    expect(stageCsvRows(table, SINGLE, "EUR")).toEqual([
      {
        line: 2,
        rawDate: null,
        draft: {
          date: "2026-02-01",
          label: "SHOP",
          amount: "-12.50",
          externalId: null,
        },
      },
      {
        line: 3,
        rawDate: null,
        draft: {
          date: "2026-02-05",
          label: "SALARY",
          amount: "1143.88",
          externalId: null,
        },
      },
    ]);
  });

  it("keeps a row it cannot read, with what the file says, so that it can be fixed", () => {
    const table = [
      ["Date", "Label", "Amount"],
      ["30/02/2026", "APPLE MUSIC", "-5,99"],
      ["06/02/2026", "", "-3,00"],
      ["07/02/2026", "SHOP", "twelve"],
    ];

    expect(stageCsvRows(table, SINGLE, "EUR")).toEqual([
      {
        line: 2,
        rawDate: "30/02/2026",
        draft: {
          date: "",
          label: "APPLE MUSIC",
          amount: "-5,99",
          externalId: null,
        },
      },
      {
        line: 3,
        rawDate: null,
        draft: {
          date: "2026-02-06",
          label: "",
          amount: "-3,00",
          externalId: null,
        },
      },
      {
        line: 4,
        rawDate: null,
        draft: {
          date: "2026-02-07",
          label: "SHOP",
          amount: "twelve",
          externalId: null,
        },
      },
    ]);
  });

  it("reads a debit as an outgoing amount and a credit as an incoming one", () => {
    const table = [
      ["Date", "Label", "Debit", "Credit"],
      ["01/02/2026", "SHOP", "12,50", ""],
      ["05/02/2026", "SALARY", "", "1 143,88"],
    ];

    expect(
      stageCsvRows(table, SPLIT, "EUR").map((row) => row.draft.amount),
    ).toEqual(["-12.50", "1143.88"]);
  });

  it("gives a negative debit one minus sign, not two, when it cannot be read", () => {
    const table = [
      ["Date", "Label", "Debit", "Credit"],
      ["31/02/2026", "SHOP", "-12,50", ""],
    ];

    expect(stageCsvRows(table, SPLIT, "EUR")[0]?.draft.amount).toBe("-12,50");
  });

  it("leaves out the rows with no date, label or amount, which hold no movement", () => {
    const table = [
      ["Date", "Label", "Amount", "Note"],
      ["", "", "", ""],
      ["01/02/2026", "SHOP", "-12,50", ""],
      ["", "", "", "total"],
    ];

    expect(stageCsvRows(table, SINGLE, "EUR").map((row) => row.line)).toEqual([
      3,
    ]);
  });

  it("reads every row as a movement when the file has no header", () => {
    const table = [["01/02/2026", "SHOP", "-12,50"]];

    const staged = stageCsvRows(table, { ...SINGLE, hasHeader: false }, "EUR");

    expect(staged.map((row) => row.line)).toEqual([1]);
  });
});

const CATEGORIES = [
  { id: 7, name: "Courses", archived: false },
  { id: 8, name: "Logement", archived: false },
  { id: 9, name: "Salaire", archived: false },
  { id: 10, name: "Épargne", archived: false },
];

describe("stageMovementFile", () => {
  const sheetTab = readFileSync(
    path.join(process.cwd(), "tests", "fixtures", "import-sheet-tab-fr.csv"),
    "utf8",
  );
  const options = { currency: "EUR", source: "import-sheet-tab-fr.csv" };

  it("signs the amounts of an unsigned file by type: expenses and savings leave, incomes enter", () => {
    const { rows } = stageMovementFile(sheetTab, options, CATEGORIES);

    expect(
      rows.map((row) => [row.line, row.draft.amount, row.details.type, row.guess?.type]),
    ).toEqual([
      [2, "-12.50", "expense", "expense"],
      [3, "1500.00", "income", "income"],
      [4, "-700.00", "expense", "expense"],
      [5, "-24.90", "expense", "expense"],
      [6, "-573.16", "savings", "savings"],
    ]);
  });

  it("finds the category by its name whatever the case, and leaves savings with none", () => {
    const { rows } = stageMovementFile(
      sheetTab.replace(";Courses", ";COURSES"),
      options,
      CATEGORIES,
    );

    expect(rows.map((row) => row.details.categoryId)).toEqual([7, 9, 8, 7, null]);
  });

  it("carries the payment mode, the label and the date, and no savings account yet", () => {
    const [first] = stageMovementFile(sheetTab, options, CATEGORIES).rows;

    expect(first).toMatchObject({
      rawDate: null,
      draft: { date: "2026-01-13", label: "Carrefour", externalId: null },
      details: { paymentMode: "card", description: null, savingsAccountId: null },
    });
  });

  it("does not look for an archived category, which cannot be assigned", () => {
    const { rows } = stageMovementFile(sheetTab, options, [
      { id: 7, name: "Courses", archived: true },
    ]);

    expect(rows[0]?.details.categoryId).toBeNull();
  });

  it("keeps the signs of a signed file, so that money coming back from savings stays an incoming amount", () => {
    const text = readFileSync(
      path.join(process.cwd(), "tests", "fixtures", "import-savings-signed-fr.csv"),
      "utf8",
    );

    const { rows } = stageMovementFile(
      text,
      { currency: "EUR", source: "import-savings-signed-fr.csv" },
      CATEGORIES,
    );

    expect(rows.map((row) => [row.draft.amount, row.details.type])).toEqual([
      ["-300.00", "savings"],
      ["-45.20", "expense"],
      ["50.00", "savings"],
      ["1500.00", "income"],
    ]);
  });

  it("keeps a row it cannot read among the others, with what the file says and no guess", () => {
    const text = "Date;Description;Montant\n12/02/2026;CARD SHOP;-12,50\n30/02/2026;SHOP;-5,00\n";

    const { rows } = stageMovementFile(text, { currency: "EUR", source: "feb.csv" }, CATEGORIES);

    expect(rows.map((row) => row.line)).toEqual([2, 3]);
    expect(rows[1]).toMatchObject({
      line: 3,
      guess: null,
      rawDate: "30/02/2026",
      draft: { date: "", label: "SHOP", amount: "-5,00", externalId: null },
    });
    expect(rows[0]?.guess).not.toBeNull();
  });

  it("gives no row for a file it cannot analyze, and keeps what the reader said", () => {
    const { rows, reading } = stageMovementFile("", options, CATEGORIES);

    expect(rows).toEqual([]);
    expect(reading.issues).toEqual([{ kind: "emptyFile" }]);
  });
});
