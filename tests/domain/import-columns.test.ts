import { describe, expect, it } from "vitest";

import {
  detectCategoryColumn,
  detectColumnRoles,
  detectPaymentModeColumn,
  detectTypeColumn,
  readMovementType,
  readPaymentMode,
} from "../../src/domain/import-columns";

describe("readMovementType", () => {
  it("reads English type names, whatever the case", () => {
    expect(readMovementType("Expense")).toBe("expense");
    expect(readMovementType("INCOME")).toBe("income");
    expect(readMovementType("savings")).toBe("savings");
  });

  it("reads French type names, with or without accents", () => {
    expect(readMovementType("Dépense")).toBe("expense");
    expect(readMovementType("Depense")).toBe("expense");
    expect(readMovementType("Revenu")).toBe("income");
    expect(readMovementType(" Épargne ")).toBe("savings");
  });

  it("returns null for anything else", () => {
    expect(readMovementType("Card")).toBeNull();
    expect(readMovementType("")).toBeNull();
  });

  it("does not read names inherited from Object.prototype", () => {
    expect(readMovementType("constructor")).toBeNull();
    expect(readMovementType("toString")).toBeNull();
  });
});

describe("detectTypeColumn", () => {
  // The rows are the data rows; the first one sits on line 2, below a header.
  const FIRST_LINE = 2;

  it("finds the column whose cells name a movement type", () => {
    const rows = [
      ["01/02/2026", "Groceries", "Expense", "-12,50"],
      ["02/02/2026", "Salary", "Income", "1500,00"],
      ["03/02/2026", "Livret", "Savings", "200,00"],
    ];

    expect(detectTypeColumn(rows, FIRST_LINE)).toEqual({
      column: 2,
      unrecognized: [],
      alsoMatching: [],
    });
  });

  it("ignores empty cells", () => {
    const rows = [
      ["01/02/2026", "Groceries", "Expense"],
      ["02/02/2026", "Gift", ""],
    ];

    expect(detectTypeColumn(rows, FIRST_LINE)?.column).toBe(2);
  });

  it("reports the values it cannot read, with their lines in the file", () => {
    const rows = [
      ["Groceries", "Expense"],
      ["Refund", "Reimbursement"],
      ["Salary", "Income"],
      ["Gift", "reimbursement"],
      ["Rent", "Expense"],
    ];

    expect(detectTypeColumn(rows, FIRST_LINE)).toEqual({
      column: 1,
      unrecognized: [{ value: "Reimbursement", lines: [3, 5] }],
      alsoMatching: [],
    });
  });

  it("keeps the first column and names the others that also hold types", () => {
    const rows = [
      ["Expense", "Savings"],
      ["Income", "Expense"],
    ];

    expect(detectTypeColumn(rows, FIRST_LINE)).toEqual({
      column: 0,
      unrecognized: [],
      alsoMatching: [1],
    });
  });

  it("returns null for a column that is empty on every row", () => {
    expect(
      detectTypeColumn(
        [
          ["a", ""],
          ["b", ""],
        ],
        FIRST_LINE,
      ),
    ).toBeNull();
  });

  it("returns null when type names are not the majority of a column", () => {
    const rows = [
      ["Expense", "x"],
      ["Card", "y"],
    ];

    expect(detectTypeColumn(rows, FIRST_LINE)).toBeNull();
  });

  it("returns null without rows", () => {
    expect(detectTypeColumn([], FIRST_LINE)).toBeNull();
  });
});

describe("readPaymentMode", () => {
  it("reads English and French names, with or without accents", () => {
    expect(readPaymentMode("Card")).toBe("card");
    expect(readPaymentMode("Carte")).toBe("card");
    expect(readPaymentMode("Transfer")).toBe("transfer");
    expect(readPaymentMode("Virement")).toBe("transfer");
    expect(readPaymentMode("Direct debit")).toBe("direct_debit");
    expect(readPaymentMode("Prélèvement")).toBe("direct_debit");
  });

  it("returns null for anything else", () => {
    expect(readPaymentMode("Cash")).toBeNull();
    expect(readPaymentMode("")).toBeNull();
    expect(readPaymentMode("constructor")).toBeNull();
  });
});

describe("detectPaymentModeColumn", () => {
  it("finds the payment mode column and reports the modes it does not know", () => {
    const rows = [
      ["Groceries", "Expense", "Card"],
      ["Gift", "Expense", "Cash"],
      ["Rent", "Expense", "Direct debit"],
      ["Salary", "Income", "Transfer"],
    ];

    expect(detectPaymentModeColumn(rows, 2)).toEqual({
      column: 2,
      unrecognized: [{ value: "Cash", lines: [3] }],
      alsoMatching: [],
    });
  });

  it("returns null when no column holds payment modes", () => {
    expect(detectPaymentModeColumn([["Groceries", "Expense"]], 2)).toBeNull();
  });
});

describe("detectCategoryColumn", () => {
  const rows = [
    ["01/02/2026", "Carrefour", "Food", "ref-1"],
    ["02/02/2026", "Landlord", "Rent", "ref-2"],
    ["03/02/2026", "Auchan", "Food", "ref-3"],
    ["04/02/2026", "Monoprix", "Food", "ref-4"],
  ];

  it("picks the remaining column with the fewest distinct values", () => {
    expect(detectCategoryColumn(rows, [0, 1])).toBe(2);
  });

  it("never picks a column that is already taken", () => {
    expect(detectCategoryColumn(rows, [0, 1, 2])).toBeNull();
  });

  it("returns null when no remaining column repeats a value", () => {
    expect(
      detectCategoryColumn(
        [
          ["a", "x"],
          ["b", "y"],
        ],
        [0],
      ),
    ).toBeNull();
  });

  it("returns null without rows", () => {
    expect(detectCategoryColumn([], [])).toBeNull();
  });
});

describe("detectColumnRoles", () => {
  // Date, label and amount come from the mapping; the other columns are found here.
  const MAPPED_COLUMNS = [0, 1, 2];
  const FIRST_LINE = 2;

  it("finds every optional column and reports nothing when all is understood", () => {
    const rows = [
      ["01/02/2026", "Carrefour", "-12,50", "Expense", "Card", "Food"],
      ["02/02/2026", "Landlord", "-700,00", "Expense", "Transfer", "Rent"],
      ["03/02/2026", "Auchan", "-30,00", "Expense", "Card", "Food"],
    ];

    expect(detectColumnRoles(rows, FIRST_LINE, MAPPED_COLUMNS)).toEqual({
      typeColumn: 3,
      paymentModeColumn: 4,
      categoryColumn: 5,
      issues: [],
    });
  });

  it("reports each column it cannot find, in a fixed order", () => {
    const rows = [
      ["01/02/2026", "Carrefour", "-12,50"],
      ["02/02/2026", "Auchan", "-30,00"],
    ];

    expect(detectColumnRoles(rows, FIRST_LINE, MAPPED_COLUMNS)).toEqual({
      typeColumn: null,
      paymentModeColumn: null,
      categoryColumn: null,
      issues: [
        { kind: "columnNotFound", role: "type" },
        { kind: "columnNotFound", role: "paymentMode" },
        { kind: "columnNotFound", role: "category" },
      ],
    });
  });

  it("reports the values of a found column that it cannot read", () => {
    const rows = [
      ["01/02/2026", "Carrefour", "-12,50", "Expense", "Card", "Food"],
      ["02/02/2026", "Gift", "-5,00", "Refund", "Cash", "Food"],
      ["03/02/2026", "Auchan", "-30,00", "Expense", "Card", "Food"],
    ];

    expect(detectColumnRoles(rows, FIRST_LINE, MAPPED_COLUMNS).issues).toEqual([
      { kind: "unrecognizedValue", role: "type", value: "Refund", lines: [3] },
      {
        kind: "unrecognizedValue",
        role: "paymentMode",
        value: "Cash",
        lines: [3],
      },
    ]);
  });

  it("reports a second column that also holds types", () => {
    const rows = [
      ["01/02/2026", "Carrefour", "-12,50", "Expense", "Expense", "Food"],
      ["02/02/2026", "Salary", "1500,00", "Income", "Income", "Pay"],
    ];

    expect(
      detectColumnRoles(rows, FIRST_LINE, MAPPED_COLUMNS).issues,
    ).toContainEqual({
      kind: "ambiguousColumn",
      role: "type",
      column: 3,
      alsoMatching: [4],
    });
  });
});
