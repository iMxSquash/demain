import { describe, expect, it } from "vitest";

import {
  findHeaderIndex,
  isTotalRow,
  movementColumns,
} from "../../src/domain/import-blocks";

describe("findHeaderIndex", () => {
  it("is the first line when it names the date, the label and the amount", () => {
    expect(
      findHeaderIndex([
        ["Date", "Description", "Amount"],
        ["13/01/2026", "Shop", "-12,50"],
      ]),
    ).toBe(0);
  });

  it("skips the lines above the header", () => {
    expect(
      findHeaderIndex([
        ["Compte", "Synthétique"],
        ["Solde au 31/01/2026", "1 234,56"],
        ["Date", "Libellé", "Montant"],
        ["13/01/2026", "Shop", "-12,50"],
      ]),
    ).toBe(2);
  });

  it("takes the first line that names the three, not a later one", () => {
    expect(
      findHeaderIndex([
        ["Date", "Label", "Amount"],
        ["Date", "Label", "Amount"],
      ]),
    ).toBe(0);
  });

  it("is also found when the amount is split in debit and credit", () => {
    expect(
      findHeaderIndex([
        ["Export"],
        ["Date", "Label", "Debit", "Credit"],
      ]),
    ).toBe(1);
  });

  it("falls back on the first line when no line names the three", () => {
    expect(findHeaderIndex([["a", "b"], ["Date", "Label"], ["1", "2"]])).toBe(0);
    expect(findHeaderIndex([])).toBe(0);
  });
});

describe("movementColumns", () => {
  const ANCHORS = [0, 1, 2];

  it("leaves out the block beside the table, split by an empty column", () => {
    const table = [
      ["Date", "Description", "Amount", "", "Summary", ""],
      ["13/01/2026", "Shop", "12,50", "", "Income", "1500,00"],
      ["14/01/2026", "Pay", "100,00", "", "Expenses", "112,50"],
    ];

    expect(movementColumns(table, 0, ANCHORS)).toEqual({ first: 0, last: 2 });
  });

  it("leaves out a block on the left as well", () => {
    const table = [
      ["Summary", "", "Date", "Description", "Amount"],
      ["Income", "", "13/01/2026", "Shop", "12,50"],
    ];

    expect(movementColumns(table, 0, [2, 3, 4])).toEqual({ first: 2, last: 4 });
  });

  it("keeps the columns of the table that come before the first anchor", () => {
    const table = [
      ["Reference", "Date", "Description", "Amount", "", "Summary"],
      ["A1", "13/01/2026", "Shop", "12,50", "", "Income"],
    ];

    expect(movementColumns(table, 0, [1, 2, 3])).toEqual({ first: 0, last: 3 });
  });

  it("excludes nothing when no column separates two blocks", () => {
    const table = [
      ["Date", "Description", "Amount", "Category"],
      ["13/01/2026", "Shop", "12,50", "Food"],
    ];

    expect(movementColumns(table, 0, ANCHORS)).toEqual({ first: 0, last: 3 });
  });

  it("counts a column with a header and no value as part of the table", () => {
    const table = [
      ["Date", "Description", "Amount", "Type", "Category"],
      ["13/01/2026", "Shop", "12,50", "", "Food"],
    ];

    expect(movementColumns(table, 0, ANCHORS)).toEqual({ first: 0, last: 4 });
  });

  it("takes a cell with only spaces for an empty one", () => {
    const table = [
      ["Date", "Description", "Amount", "  ", "Summary"],
      ["13/01/2026", "Shop", "12,50", " ", "Income"],
    ];

    expect(movementColumns(table, 0, ANCHORS)).toEqual({ first: 0, last: 2 });
  });

  it("does not let the lines above the header fill the empty column", () => {
    const table = [
      ["Account", "Checking", "", "Owner"],
      ["Date", "Description", "Amount", "", "Summary"],
      ["13/01/2026", "Shop", "12,50", "", "Income"],
    ];

    expect(movementColumns(table, 1, ANCHORS)).toEqual({ first: 0, last: 2 });
  });

  it("reads a very long table, up to its widest and last row", () => {
    // Spreading that many rows into Math.max overflows the call stack.
    const ROW_COUNT = 200_000;
    const table = [
      ["Date", "Description", "Amount"],
      ...Array.from({ length: ROW_COUNT }, () => ["13/01/2026", "Shop", "12,50"]),
      ["14/01/2026", "Pay", "100,00", "Last"],
    ];

    expect(movementColumns(table, 0, ANCHORS)).toEqual({ first: 0, last: 3 });
  });

  it("is null when the anchors sit in different blocks", () => {
    const table = [
      ["Date", "Description", "", "Amount"],
      ["13/01/2026", "Shop", "", "12,50"],
    ];

    expect(movementColumns(table, 0, [0, 1, 3])).toBeNull();
  });

  it("is null when an anchor is outside every block", () => {
    const table = [["Date", "Description", "Amount"]];

    expect(movementColumns(table, 0, [0, 1, 7])).toBeNull();
  });
});

describe("isTotalRow", () => {
  const inTable = (column: number): boolean => column <= 2;
  const test = (cells: string[], inBlock = inTable): boolean =>
    isTotalRow(cells, 0, "dmy", inBlock);

  it("recognizes a row with a total word and no date", () => {
    expect(test(["Total", "", "1 612,50"])).toBe(true);
    expect(test(["Total", "", "", "", "Summary"])).toBe(true);
  });

  it("recognizes the balance lines of a statement", () => {
    expect(test(["Solde au 31/01/2026", "1 234,56", ""])).toBe(true);
    expect(test(["", "Balance", "1 234,56"])).toBe(true);
  });

  it("recognizes the other total words, with accents, case and hyphens", () => {
    expect(test(["Sous-total", "", "12,00"])).toBe(true);
    expect(test(["SUBTOTAL", "", "12,00"])).toBe(true);
    expect(test(["Totaux", "", "12,00"])).toBe(true);
    expect(test(["Sum", "", "12,00"])).toBe(true);
  });

  it("keeps a row that has a readable date, whatever its label says", () => {
    expect(test(["13/01/2026", "TOTAL ENERGIES", "50,00"])).toBe(false);
    expect(test(["13/01/2026", "Solde de tout compte", "50,00"])).toBe(false);
  });

  it("keeps a row whose date is written without a year", () => {
    expect(test(["13/01", "Solde initial", "50,00"])).toBe(false);
  });

  it("reads the date with the format it is given", () => {
    expect(isTotalRow(["01/13/2026", "Total", "1"], 0, "mdy", inTable)).toBe(false);
    expect(isTotalRow(["01/13/2026", "Total", "1"], 0, "dmy", inTable)).toBe(true);
  });

  it("recognizes a total word spelled in one or two words", () => {
    expect(test(["Sub total", "", "12,00"])).toBe(true);
    expect(test(["Soustotal", "", "12,00"])).toBe(true);
    expect(test(["Total général", "", "12,00"])).toBe(true);
    expect(test(["Totals", "", "12,00"])).toBe(true);
  });

  it.each(["SumUp", "Summit", "Summer camp", "Totalenergies"])(
    "keeps a row whose first word only starts like a total word: %j",
    (label) => {
      expect(test(["", label, "12,50"])).toBe(false);
      expect(test([label, "", "12,50"])).toBe(false);
    },
  );

  it("keeps a row with no date and no total word", () => {
    expect(test(["abc", "Shop", "12,50"])).toBe(false);
    expect(test(["", "", ""])).toBe(false);
  });

  it("keeps a row whose total word is not at the start of a cell", () => {
    expect(test(["", "Grand total", "12,50"])).toBe(false);
  });

  it("ignores a total word in a cell outside the table", () => {
    expect(test(["", "Shop", "12,50", "", "Total"])).toBe(false);
  });
});
