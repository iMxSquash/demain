import { describe, expect, it } from "vitest";

import type { CsvMapping } from "../../src/domain/import-csv";
import { stageCsvRows } from "../../src/domain/import-staging";

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
