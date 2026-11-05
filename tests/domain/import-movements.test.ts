import { describe, expect, it } from "vitest";

import { readMovementFile } from "../../src/domain/import-movements";
import { normalizeLabel } from "../../src/domain/import-row";

const OPTIONS = { currency: "EUR", source: "january.csv" };

// Synthetic files: the figures and labels are invented.
const FULL_FILE = [
  "Date;Description;Montant;Type;Mode de paiement;Catégorie;Notes",
  "13/01/2026;Carrefour;-12,50;Dépense;CB;Courses;weekly shop",
  "14/01/2026;Salaire;1500,00;Revenu;VIR;Paie;",
].join("\n");

describe("readMovementFile", () => {
  it("reads the type, the category, the payment mode and the description of each row", () => {
    const reading = readMovementFile(FULL_FILE, OPTIONS);

    expect(reading.issues).toEqual([]);
    expect(reading.rows).toEqual([
      {
        source: "january.csv",
        line: 2,
        date: "2026-01-13",
        label: "Carrefour",
        amount: -1_250,
        typeCell: "Dépense",
        type: {
          type: "expense",
          confidence: "high",
          evidence: { kind: "typeCell", value: "Dépense" },
          conflict: null,
          ignoredTypeCell: null,
        },
        category: "Courses",
        paymentMode: "card",
        description: "weekly shop",
        labelFromCategory: false,
      },
      expect.objectContaining({
        line: 3,
        amount: 150_000,
        category: "Paie",
        paymentMode: "transfer",
        description: null,
      }),
    ]);
  });

  it("keeps the amounts as the file signs them", () => {
    const reading = readMovementFile(
      "Date;Libellé;Débit;Crédit\n13/01/2026;Shop;12,50;\n14/01/2026;Pay;;100,00",
      OPTIONS,
    );

    expect(reading.rows.map((row) => row.amount)).toEqual([-1_250, 10_000]);
    expect(reading.rows.map((row) => row.typeCell)).toEqual([null, null]);
  });

  it("numbers the lines of the file, whatever lies above the header", () => {
    const reading = readMovementFile(
      [
        "Compte;Courant",
        "Solde au 31/01/2026;1 234,56",
        "Date;Libellé;Montant",
        "13/01/2026;Carrefour;-12,50",
        "14/01/2026;Auchan;-30,00",
      ].join("\n"),
      OPTIONS,
    );

    expect(reading.rows.map((row) => [row.line, row.label])).toEqual([
      [4, "Carrefour"],
      [5, "Auchan"],
    ]);
    // The header line is no movement either.
    expect(reading.issues.map((issue) => issue.kind)).not.toContain("rowUnreadable");
    expect(reading.issues).toContainEqual({
      kind: "rowsIgnored",
      reason: "beforeHeader",
      lines: [1, 2],
    });
  });

  it("reads nothing from the totals nor from the block beside the table", () => {
    const reading = readMovementFile(
      [
        "Date;Description;Amount;;Summary;",
        "13/01/2026;Carrefour;-12,50;;Income;1500,00",
        "14/01/2026;Auchan;-30,00;;Expense;42,50",
        ";;;;Savings;0,00",
        "Total;;-42,50;;;",
      ].join("\n"),
      OPTIONS,
    );

    expect(reading.rows.map((row) => row.label)).toEqual(["Carrefour", "Auchan"]);
    expect(reading.issues.filter((issue) => issue.kind === "rowUnreadable")).toEqual(
      [],
    );
  });

  describe("a row with no label", () => {
    const FILE = [
      "Date;Description;Montant;Catégorie",
      "13/01/2026;Carrefour;-12,50;Courses",
      "14/01/2026;;-30,00;Courses",
      "15/01/2026;;-5,00;",
    ].join("\n");

    it("takes its category as label, and says so", () => {
      const reading = readMovementFile(FILE, OPTIONS);

      expect(reading.rows[1]).toMatchObject({
        line: 3,
        label: "Courses",
        category: "Courses",
        labelFromCategory: true,
      });
      expect(reading.rows[0]?.labelFromCategory).toBe(false);
    });

    it("is unreadable without a category either", () => {
      const reading = readMovementFile(FILE, OPTIONS);

      expect(reading.rows.map((row) => row.line)).toEqual([2, 3]);
      expect(reading.issues).toContainEqual({
        kind: "rowUnreadable",
        line: 4,
        ref: expect.objectContaining({ key: "importLabelRequired" }),
      });
    });

    it("is unreadable when the file has no category column", () => {
      const reading = readMovementFile(
        "Date;Description;Montant\n13/01/2026;;-12,50",
        OPTIONS,
      );

      expect(reading.rows).toEqual([]);
      expect(reading.issues).toContainEqual(
        expect.objectContaining({ kind: "rowUnreadable", line: 2 }),
      );
    });
  });

  describe("the number format of the file", () => {
    it("reads 1.234 as a thousand in a file that writes decimals with a comma", () => {
      const reading = readMovementFile(
        "Date;Libellé;Montant\n13/01/2026;Loyer;-12,50\n14/01/2026;Prime;1.234",
        OPTIONS,
      );

      expect(reading.rows.map((row) => row.amount)).toEqual([-1_250, 123_400]);
    });

    it("reads 1,250 as a thousand in a file that writes decimals with a point", () => {
      const reading = readMovementFile(
        'Date,Label,Amount\n13/01/2026,Rent,"-1,234.56"\n14/01/2026,Bonus,"1,250"',
        OPTIONS,
      );

      expect(reading.rows.map((row) => row.amount)).toEqual([-123_456, 125_000]);
    });

    it("rejects the row that does not follow it, and keeps the others", () => {
      const reading = readMovementFile(
        [
          "Date;Libellé;Montant",
          "13/01/2026;A;-12,50",
          "14/01/2026;B;-30,50",
          "15/01/2026;C;-3.50",
        ].join("\n"),
        OPTIONS,
      );

      expect(reading.rows.map((row) => row.label)).toEqual(["A", "B"]);
      expect(reading.issues).toContainEqual(
        expect.objectContaining({ kind: "rowUnreadable", line: 4 }),
      );
      expect(reading.issues).toContainEqual({
        kind: "numberFormatAmbiguous",
        mark: ",",
      });
    });
  });

  describe("the type of each row", () => {
    it("guesses it from the category and the direction when there is no type column", () => {
      const reading = readMovementFile(
        [
          "Date;Libellé;Montant;Catégorie",
          "13/01/2026;Virement employeur;1500,00;Salaire",
          "14/01/2026;Carrefour;-12,50;Courses",
        ].join("\n"),
        OPTIONS,
      );

      expect(reading.rows.map((row) => row.type)).toEqual([
        {
          type: "income",
          confidence: "medium",
          evidence: {
            kind: "categoryWord",
            category: "Salaire",
            word: "salaire",
            type: "income",
            origin: "fixed",
          },
          conflict: null,
          ignoredTypeCell: null,
        },
        {
          type: "expense",
          confidence: "medium",
          evidence: { kind: "sign", direction: "out" },
          conflict: null,
          ignoredTypeCell: null,
        },
      ]);
    });

    it("lets an explicit type win over a negative amount, and flags the row", () => {
      const reading = readMovementFile(
        "Date;Libellé;Montant;Type\n13/01/2026;Remboursement;-12,50;Income\n14/01/2026;Shop;-3,00;Expense",
        OPTIONS,
      );

      expect(reading.rows[0]?.type).toMatchObject({
        type: "income",
        confidence: "low",
        conflict: { kind: "sign", direction: "out" },
      });
      expect(reading.rows[1]?.type.confidence).toBe("high");
    });

    it("reads the direction from the whole file: unsigned amounts carry none", () => {
      const reading = readMovementFile(
        "Date;Libellé;Montant\n13/01/2026;Shop;12,50\n14/01/2026;Pay;100,00",
        OPTIONS,
      );

      expect(reading.rows.map((row) => row.type.evidence)).toEqual([
        { kind: "none" },
        { kind: "none" },
      ]);
    });

    it("keeps an unknown type cell aside and keeps the row", () => {
      const reading = readMovementFile(
        "Date;Libellé;Montant;Type\n13/01/2026;A;-1,00;Refund\n14/01/2026;B;-2,00;Expense\n15/01/2026;C;-3,00;Expense",
        OPTIONS,
      );

      expect(reading.rows).toHaveLength(3);
      expect(reading.rows[0]).toMatchObject({
        typeCell: "Refund",
        type: { ignoredTypeCell: "Refund", confidence: "low" },
      });
    });

    it("uses the vocabulary and the history it is given", () => {
      const file = "Date;Libellé;Montant;Catégorie\n13/01/2026;Livret A;-50,00;Courses";

      expect(
        readMovementFile(file, {
          ...OPTIONS,
          history: new Map([[normalizeLabel("Livret A"), "savings"]]),
        }).rows[0]?.type,
      ).toMatchObject({ type: "savings" });
      expect(
        readMovementFile(file, {
          ...OPTIONS,
          vocabulary: new Map([["courses", { type: "savings", origin: "history" }]]),
        }).rows[0]?.type,
      ).toMatchObject({
        type: "savings",
        evidence: { kind: "categoryWord", origin: "history" },
      });
      expect(readMovementFile(file, OPTIONS).rows[0]?.type.type).toBe("expense");
    });

    it("ignores the category when the vocabulary is empty", () => {
      const reading = readMovementFile(
        "Date;Libellé;Montant;Catégorie\n13/01/2026;Virement;1500,00;Salaire\n14/01/2026;Shop;-5,00;Courses",
        { ...OPTIONS, vocabulary: new Map() },
      );

      expect(reading.rows[0]?.type.evidence).toEqual({ kind: "sign", direction: "in" });
    });
  });

  describe("dates written without a year", () => {
    const YEARLESS = "Date;Libellé;Montant\n13/01;Carrefour;-12,50\n14/01;Auchan;-30,00";

    it("takes the year of the file name, and says so", () => {
      const reading = readMovementFile(YEARLESS, {
        ...OPTIONS,
        source: "january-2026.csv",
      });

      expect(reading.rows.map((row) => row.date)).toEqual(["2026-01-13", "2026-01-14"]);
      expect(reading.issues).toContainEqual({ kind: "dateYearAssumed", year: 2026 });
    });

    it("prefers the year it is given, and says nothing", () => {
      const reading = readMovementFile(YEARLESS, {
        ...OPTIONS,
        source: "january-2025.csv",
        year: 2026,
      });

      expect(reading.rows[0]?.date).toBe("2026-01-13");
      expect(reading.issues.map((issue) => issue.kind)).not.toContain(
        "dateYearAssumed",
      );
    });

    it("reads no row without any year", () => {
      const reading = readMovementFile(YEARLESS, OPTIONS);

      expect(reading.rows).toEqual([]);
      expect(reading.issues).toContainEqual({ kind: "dateYearMissing" });
    });
  });

  it("reads nothing from a file it cannot split, and says why", () => {
    const reading = readMovementFile("", OPTIONS);

    expect(reading.rows).toEqual([]);
    expect(reading.issues).toEqual([{ kind: "emptyFile" }]);
    expect(reading.source).toBe("january.csv");
  });

  it("uses the delimiter the user chose", () => {
    const reading = readMovementFile(
      "Date,Libellé,Montant\n13/01/2026,Shop,-12.50",
      { ...OPTIONS, delimiter: "," },
    );

    expect(reading.analysis.delimiter).toBe(",");
    expect(reading.rows).toHaveLength(1);
  });
});

describe("readMovementFile with columns chosen by the user", () => {
  // The detection takes "Notes" for the category; the user knows it is the description.
  const FILE = [
    "Date;Description;Montant;Notes;Rubrique",
    "13/01/2026;Carrefour;-12,50;weekly shop;Courses",
    "14/01/2026;Fnac;-30,00;gift;Loisirs",
    "15/01/2026;Salaire;1500,00;payroll;Paie",
  ].join("\n");

  it("reads the rows again with the roles the user assigned", () => {
    const reading = readMovementFile(FILE, {
      ...OPTIONS,
      columns: { categoryColumn: 3, descriptionColumn: 4 },
    });

    expect(reading.analysis.categoryColumn).toBe(3);
    expect(reading.analysis.descriptionColumn).toBe(4);
    expect(reading.rows.map(({ category, description }) => [category, description])).toEqual([
      ["weekly shop", "Courses"],
      ["gift", "Loisirs"],
      ["payroll", "Paie"],
    ]);
  });

  it("keeps a row whose chosen type column holds no known type, and says why", () => {
    const reading = readMovementFile(FILE, { ...OPTIONS, columns: { typeColumn: 3 } });

    expect(reading.rows).toHaveLength(3);
    expect(reading.rows[0]?.typeCell).toBe("weekly shop");
    expect(reading.rows[0]?.type.ignoredTypeCell).toBe("weekly shop");
    expect(reading.issues).toContainEqual(
      expect.objectContaining({ kind: "unrecognizedValue", role: "type", value: "gift" }),
    );
  });

  it("offers the columns that can take a role, with their header", () => {
    const { analysis } = readMovementFile(FILE, OPTIONS);

    expect(analysis.roleColumns).toEqual([
      { column: 3, header: "Notes" },
      { column: 4, header: "Rubrique" },
    ]);
  });

  it("offers no column for a column beside the table", () => {
    const beside = [
      "Date;Description;Montant;Type;;Month;Total",
      "13/01/2026;Carrefour;-12,50;Expense;;January;-12,50",
      "14/01/2026;Salaire;1500,00;Income;;;",
    ].join("\n");

    const { analysis } = readMovementFile(beside, OPTIONS);

    expect(analysis.roleColumns.map(({ column }) => column)).toEqual([3]);
  });
});
