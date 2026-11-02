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

  it.each([
    ["CB", "card"],
    ["Carte bancaire", "card"],
    ["Carte bleue", "card"],
    ["PRLV", "direct_debit"],
    ["PRLV SEPA", "direct_debit"],
    ["Prélèvement SEPA", "direct_debit"],
    ["VIR", "transfer"],
    ["Vir SEPA", "transfer"],
    ["Virement SEPA", "transfer"],
  ])("reads the bank abbreviation %j", (text, mode) => {
    expect(readPaymentMode(text)).toBe(mode);
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
  // Without header names, the values alone decide.
  const NO_HEADER: string[] = [];

  it("finds every optional column and reports nothing when all is understood", () => {
    const rows = [
      ["01/02/2026", "Carrefour", "-12,50", "Expense", "Card", "Food"],
      ["02/02/2026", "Landlord", "-700,00", "Expense", "Transfer", "Rent"],
      ["03/02/2026", "Auchan", "-30,00", "Expense", "Card", "Food"],
    ];

    expect(detectColumnRoles(rows, FIRST_LINE, MAPPED_COLUMNS, NO_HEADER)).toEqual({
      typeColumn: 3,
      paymentModeColumn: 4,
      categoryColumn: 5,
      descriptionColumn: null,
      issues: [],
    });
  });

  it("reports each column it cannot find, in a fixed order", () => {
    const rows = [
      ["01/02/2026", "Carrefour", "-12,50"],
      ["02/02/2026", "Auchan", "-30,00"],
    ];

    expect(detectColumnRoles(rows, FIRST_LINE, MAPPED_COLUMNS, NO_HEADER)).toEqual({
      typeColumn: null,
      paymentModeColumn: null,
      categoryColumn: null,
      descriptionColumn: null,
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

    expect(detectColumnRoles(rows, FIRST_LINE, MAPPED_COLUMNS, NO_HEADER).issues).toEqual([
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
      detectColumnRoles(rows, FIRST_LINE, MAPPED_COLUMNS, NO_HEADER).issues,
    ).toContainEqual({
      kind: "ambiguousColumn",
      role: "type",
      column: 3,
      alsoMatching: [4],
    });
  });
  describe("with the names of the headers", () => {
    it("takes the column a category header names over the fewest distinct values", () => {
      // Column 3 repeats the most, but only the header says which one is the category.
      const header = ["Date", "Description", "Amount", "Reference", "Rubrique"];
      const rows = [
        ["01/02/2026", "Carrefour", "-12,50", "R1", "Food"],
        ["02/02/2026", "Landlord", "-700,00", "R1", "Rent"],
        ["03/02/2026", "Cinema", "-9,00", "R1", "Fun"],
      ];

      const roles = detectColumnRoles(rows, FIRST_LINE, MAPPED_COLUMNS, header);

      expect(roles.categoryColumn).toBe(4);
      expect(roles.issues).not.toContainEqual({
        kind: "columnNotFound",
        role: "category",
      });
    });

    it("does not take a column that is already mapped for the category", () => {
      const header = ["Date", "Category label", "Amount", "Reference"];
      const rows = [
        ["01/02/2026", "Carrefour", "-12,50", "R1"],
        ["02/02/2026", "Landlord", "-700,00", "R1"],
      ];

      expect(
        detectColumnRoles(rows, FIRST_LINE, MAPPED_COLUMNS, header).categoryColumn,
      ).toBe(3);
    });

    it("lets the values win: a Type header over payment modes is the payment mode", () => {
      const header = ["Date", "Description", "Amount", "Type"];
      const rows = [
        ["01/02/2026", "Carrefour", "-12,50", "CB"],
        ["02/02/2026", "Landlord", "-700,00", "PRLV"],
        ["03/02/2026", "Salary", "1500,00", "VIR"],
      ];

      const roles = detectColumnRoles(rows, FIRST_LINE, MAPPED_COLUMNS, header);

      expect(roles.paymentModeColumn).toBe(3);
      expect(roles.typeColumn).toBeNull();
      expect(roles.issues).toContainEqual({ kind: "columnNotFound", role: "type" });
    });

    it("accepts a payment mode header with one known value, and reports the others", () => {
      const header = ["Date", "Description", "Amount", "Mode de paiement"];
      const rows = [
        ["01/02/2026", "Carrefour", "-12,50", "Cash"],
        ["02/02/2026", "Landlord", "-700,00", "Cheque"],
        ["03/02/2026", "Auchan", "-30,00", "CB"],
      ];

      const roles = detectColumnRoles(rows, FIRST_LINE, MAPPED_COLUMNS, header);

      expect(roles.paymentModeColumn).toBe(3);
      expect(roles.issues).toEqual(
        expect.arrayContaining([
          { kind: "unrecognizedValue", role: "paymentMode", value: "Cash", lines: [2] },
          { kind: "unrecognizedValue", role: "paymentMode", value: "Cheque", lines: [3] },
        ]),
      );
    });

    it("accepts a type header with one known value, and reports the others", () => {
      const header = ["Date", "Description", "Amount", "Type"];
      const rows = [
        ["01/02/2026", "Gift", "-5,00", "Refund"],
        ["02/02/2026", "Landlord", "-700,00", "Expense"],
        ["03/02/2026", "Present", "-9,00", "Gift"],
      ];

      const roles = detectColumnRoles(rows, FIRST_LINE, MAPPED_COLUMNS, header);

      expect(roles.typeColumn).toBe(3);
      expect(roles.issues).toEqual(
        expect.arrayContaining([
          { kind: "unrecognizedValue", role: "type", value: "Refund", lines: [2] },
          { kind: "unrecognizedValue", role: "type", value: "Gift", lines: [4] },
        ]),
      );
    });

    it("keeps the column the header names when another one also holds types", () => {
      const header = ["Date", "Description", "Amount", "Kind", "Type"];
      const rows = [
        ["01/02/2026", "Carrefour", "-12,50", "Expense", "Expense"],
        ["02/02/2026", "Salary", "1500,00", "Income", "Income"],
      ];

      const roles = detectColumnRoles(rows, FIRST_LINE, MAPPED_COLUMNS, header);

      expect(roles.typeColumn).toBe(4);
      expect(roles.issues).toContainEqual({
        kind: "ambiguousColumn",
        role: "type",
        column: 4,
        alsoMatching: [3],
      });
    });

    it("does not take a type header whose values name no type", () => {
      const header = ["Date", "Description", "Amount", "Type"];
      const rows = [
        ["01/02/2026", "Gift", "-5,00", "Refund"],
        ["02/02/2026", "Present", "-9,00", "Gift"],
      ];

      const roles = detectColumnRoles(rows, FIRST_LINE, MAPPED_COLUMNS, header);

      expect(roles.typeColumn).toBeNull();
      expect(roles.issues).toContainEqual({ kind: "columnNotFound", role: "type" });
    });

    it.each(["Notes", "Détail de l'écriture", "Comment", "Remarque", "Memo"])(
      "takes the %j column for the description",
      (name) => {
        const header = ["Date", "Libellé", "Amount", name];
        const rows = [["01/02/2026", "Carrefour", "-12,50", "weekly shop"]];

        expect(
          detectColumnRoles(rows, FIRST_LINE, MAPPED_COLUMNS, header)
            .descriptionColumn,
        ).toBe(3);
      },
    );

    it("keeps the column a description header names out of the category guess", () => {
      // The notes repeat like categories would, but the header says what they are.
      const header = ["Date", "Libelle", "Montant", "Note"];
      const rows = [
        ["01/02/2026", "Carrefour", "-12,50", "perso"],
        ["02/02/2026", "Landlord", "-700,00", "perso"],
        ["03/02/2026", "Cinema", "-9,00", "pro"],
        ["04/02/2026", "Auchan", "-30,00", "pro"],
      ];

      const roles = detectColumnRoles(rows, FIRST_LINE, MAPPED_COLUMNS, header);

      expect(roles.descriptionColumn).toBe(3);
      expect(roles.categoryColumn).toBeNull();
      expect(roles.issues).toContainEqual({ kind: "columnNotFound", role: "category" });
    });

    it("lets a category header win and still finds the description beside it", () => {
      const header = ["Date", "Libelle", "Montant", "Note", "Categorie"];
      const rows = [
        ["01/02/2026", "Carrefour", "-12,50", "perso", "Food"],
        ["02/02/2026", "Landlord", "-700,00", "perso", "Rent"],
        ["03/02/2026", "Cinema", "-9,00", "pro", "Fun"],
      ];

      const roles = detectColumnRoles(rows, FIRST_LINE, MAPPED_COLUMNS, header);

      expect(roles.categoryColumn).toBe(4);
      expect(roles.descriptionColumn).toBe(3);
    });

    it("gives a header that names both roles to the category", () => {
      const header = ["Date", "Libelle", "Montant", "Category description"];
      const rows = [["01/02/2026", "Carrefour", "-12,50", "Food"]];

      const roles = detectColumnRoles(rows, FIRST_LINE, MAPPED_COLUMNS, header);

      expect(roles.categoryColumn).toBe(3);
      expect(roles.descriptionColumn).toBeNull();
    });

    it("never takes the label column for the description, and says nothing when there is none", () => {
      const header = ["Date", "Description", "Amount"];
      const rows = [["01/02/2026", "Carrefour", "-12,50"]];

      const roles = detectColumnRoles(rows, FIRST_LINE, MAPPED_COLUMNS, header);

      expect(roles.descriptionColumn).toBeNull();
      // Only the type, the payment mode and the category are reported as not found.
      expect(roles.issues).toHaveLength(3);
    });
  });
});
