import { describe, expect, it } from "vitest";

import {
  applyCsvMapping,
  chooseCsvMapping,
  detectDateFormat,
  detectDelimiter,
  parseCsv,
  suggestCsvMapping,
  type CsvMapping,
} from "../../src/domain/import-csv";
import { ImportParseError } from "../../src/domain/import-row";

const SEMICOLON_MAPPING: CsvMapping = {
  delimiter: ";",
  hasHeader: true,
  dateColumn: 0,
  dateFormat: "dmy",
  labelColumn: 1,
  amount: { kind: "single", column: 2 },
};

describe("parseCsv", () => {
  it("splits rows and cells on the delimiter", () => {
    expect(parseCsv("a;b;c\n1;2;3\n", ";")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("accepts CRLF line endings and a byte order mark", () => {
    expect(parseCsv("﻿a;b\r\n1;2\r\n", ";")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("keeps the delimiter, quotes and line breaks inside a quoted cell", () => {
    expect(parseCsv('a;"x;y";"say ""hi"""\n"two\nlines";b;c', ";")).toEqual([
      ["a", "x;y", 'say "hi"'],
      ["two\nlines", "b", "c"],
    ]);
  });

  it("skips blank lines", () => {
    expect(parseCsv("a;b\n\n\n1;2\n", ";")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("keeps empty cells", () => {
    expect(parseCsv("a;;c", ";")).toEqual([["a", "", "c"]]);
  });

  it("rejects a quoted cell that never closes", () => {
    expect(() => parseCsv('a;"b\n1;2', ";")).toThrow(ImportParseError);
  });
});

describe("detectDelimiter", () => {
  it("prefers the semicolon of French bank exports", () => {
    expect(detectDelimiter("Date;Libelle;Montant\n01/02/2026;CB;-12,50")).toBe(
      ";",
    );
  });

  it("detects commas and tabs", () => {
    expect(detectDelimiter("Date,Label,Amount\n2026-02-01,CB,-12.50")).toBe(
      ",",
    );
    expect(detectDelimiter("Date\tLabel\tAmount")).toBe("\t");
  });

  it("ignores delimiters inside quotes", () => {
    expect(detectDelimiter('"a,b,c";d;e')).toBe(";");
  });

  it("falls back to the semicolon when nothing matches", () => {
    expect(detectDelimiter("single column")).toBe(";");
  });
});

describe("applyCsvMapping", () => {
  it("reads date, label and amount through the mapping", () => {
    const rows = parseCsv(
      "Date;Label;Amount\n01/02/2026;CARD SHOP;-12,50\n05/02/2026;SALARY;1 143,88",
      ";",
    );

    const result = applyCsvMapping(rows, SEMICOLON_MAPPING, "EUR");

    expect(result.errors).toEqual([]);
    expect(result.rows).toEqual([
      {
        date: "2026-02-01",
        label: "CARD SHOP",
        amount: -1_250,
        externalId: null,
      },
      {
        date: "2026-02-05",
        label: "SALARY",
        amount: 114_388,
        externalId: null,
      },
    ]);
  });

  it("reads separate debit and credit columns", () => {
    const rows = parseCsv(
      "Date;Label;Debit;Credit\n01/02/2026;SHOP;12,50;\n02/02/2026;SALARY;;100,00",
      ";",
    );

    const result = applyCsvMapping(
      rows,
      {
        ...SEMICOLON_MAPPING,
        amount: { kind: "split", debitColumn: 2, creditColumn: 3 },
      },
      "EUR",
    );

    expect(result.rows.map((row) => row.amount)).toEqual([-1_250, 10_000]);
  });

  it("reads a debit written with its own minus sign as a debit", () => {
    const rows = parseCsv("D;L;Debit;Credit\n01/02/2026;SHOP;-12,50;", ";");

    const result = applyCsvMapping(
      rows,
      {
        ...SEMICOLON_MAPPING,
        amount: { kind: "split", debitColumn: 2, creditColumn: 3 },
      },
      "EUR",
    );

    expect(result.rows.map((row) => row.amount)).toEqual([-1_250]);
  });

  it("reads ISO and US dates", () => {
    const iso = applyCsvMapping(
      [["2026-02-01", "A", "1"]],
      { ...SEMICOLON_MAPPING, hasHeader: false, dateFormat: "ymd" },
      "EUR",
    );
    const us = applyCsvMapping(
      [["02/01/2026", "A", "1"]],
      { ...SEMICOLON_MAPPING, hasHeader: false, dateFormat: "mdy" },
      "EUR",
    );

    expect(iso.rows[0]?.date).toBe("2026-02-01");
    expect(us.rows[0]?.date).toBe("2026-02-01");
  });

  it("reports a bad row with its line number and keeps the good ones", () => {
    const rows = parseCsv(
      "Date;Label;Amount\n31/02/2026;IMPOSSIBLE;-1,00\n01/02/2026;OK;-2,00\n03/02/2026;BAD AMOUNT;abc",
      ";",
    );

    const result = applyCsvMapping(rows, SEMICOLON_MAPPING, "EUR");

    expect(result.rows.map((row) => row.label)).toEqual(["OK"]);
    expect(result.errors.map((error) => error.line)).toEqual([2, 4]);
  });

  it("rejects an empty label and a zero amount", () => {
    const result = applyCsvMapping(
      [
        ["01/02/2026", "", "-1,00"],
        ["01/02/2026", "ZERO", "0,00"],
      ],
      { ...SEMICOLON_MAPPING, hasHeader: false },
      "EUR",
    );

    expect(result.rows).toEqual([]);
    expect(result.errors).toHaveLength(2);
  });

  it("rejects a mapping that points outside the row", () => {
    const result = applyCsvMapping(
      [["01/02/2026", "A"]],
      { ...SEMICOLON_MAPPING, hasHeader: false },
      "EUR",
    );

    expect(result.rows).toEqual([]);
    expect(result.errors).toHaveLength(1);
  });

  it("trims the label without changing its content", () => {
    const result = applyCsvMapping(
      [["01/02/2026", "  CARD <b>SHOP</b>  ", "-1,00"]],
      { ...SEMICOLON_MAPPING, hasHeader: false },
      "EUR",
    );

    expect(result.rows[0]?.label).toBe("CARD <b>SHOP</b>");
  });
});

describe("suggestCsvMapping", () => {
  it("recognizes French headers", () => {
    expect(
      suggestCsvMapping(
        ["Date de l'opération", "Libellé", "Débit", "Crédit"],
        ";",
      ),
    ).toEqual({
      delimiter: ";",
      hasHeader: true,
      dateColumn: 0,
      dateFormat: "dmy",
      labelColumn: 1,
      amount: { kind: "split", debitColumn: 2, creditColumn: 3 },
    });
  });

  it("recognizes English headers with a single amount column", () => {
    expect(
      suggestCsvMapping(["Date", "Description", "Amount"], ","),
    ).toMatchObject({
      dateColumn: 0,
      labelColumn: 1,
      amount: { kind: "single", column: 2 },
    });
  });

  it("returns null when the headers say nothing", () => {
    expect(suggestCsvMapping(["a", "b", "c"], ";")).toBeNull();
  });
});

describe("chooseCsvMapping", () => {
  const SPLIT: CsvMapping = {
    ...SEMICOLON_MAPPING,
    amount: { kind: "split", debitColumn: 2, creditColumn: 3 },
  };
  const rows = parseCsv("Date;Label;Amount\n01/02/2026;SHOP;-12,50", ";");

  it("keeps the first mapping that reads the whole file", () => {
    const chosen = chooseCsvMapping(rows, [SPLIT, SEMICOLON_MAPPING], "EUR");

    expect(chosen?.mapping).toEqual(SEMICOLON_MAPPING);
    expect(chosen?.reading.errors).toEqual([]);
  });

  it("prefers the earlier candidate when both read the file", () => {
    const chosen = chooseCsvMapping(rows, [SEMICOLON_MAPPING, SPLIT], "EUR");

    expect(chosen?.mapping).toEqual(SEMICOLON_MAPPING);
  });

  it("keeps the first candidate, with its errors, when none reads the file", () => {
    const chosen = chooseCsvMapping(rows, [SPLIT], "EUR");

    expect(chosen?.mapping).toEqual(SPLIT);
    expect(chosen?.reading.errors).toHaveLength(1);
  });

  it("keeps the candidate with the fewest errors when none reads the whole file", () => {
    const flawed = parseCsv(
      "Date;Label;Amount\n31/02/2026;BAD DATE;-1,00\n01/03/2026;SHOP;-2,00",
      ";",
    );

    const chosen = chooseCsvMapping(flawed, [SPLIT, SEMICOLON_MAPPING], "EUR");

    expect(chosen?.mapping).toEqual(SEMICOLON_MAPPING);
    expect(chosen?.reading.errors).toHaveLength(1);
  });

  it("returns null without any candidate", () => {
    expect(chooseCsvMapping(rows, [], "EUR")).toBeNull();
  });
});

describe("detectDateFormat", () => {
  it("reads a first number above 12 as the day", () => {
    expect(detectDateFormat(["13/02/2026", "01/02/2026"])).toEqual({
      format: "dmy",
      isAmbiguous: false,
    });
  });

  it("reads a second number above 12 as the day", () => {
    expect(detectDateFormat(["02/13/2026", "02/01/2026"])).toEqual({
      format: "mdy",
      isAmbiguous: false,
    });
  });

  it("reads a four-digit first number as the year", () => {
    expect(detectDateFormat(["2026-02-01", "2026-03-04"])).toEqual({
      format: "ymd",
      isAmbiguous: false,
    });
  });

  it("proposes day first, flagged as ambiguous, when every number is 12 or less", () => {
    expect(detectDateFormat(["03/04/2026", "01/02/2026"])).toEqual({
      format: "dmy",
      isAmbiguous: true,
    });
  });

  it("returns null without dates", () => {
    expect(detectDateFormat([])).toBeNull();
  });

  it("returns null when a value is not a date", () => {
    expect(detectDateFormat(["01/02/2026", "SHOP"])).toBeNull();
  });

  it("returns null when the dates contradict each other", () => {
    expect(detectDateFormat(["13/02/2026", "02/13/2026"])).toBeNull();
  });

  it("returns null when day-first dates are mixed with year-first dates", () => {
    expect(detectDateFormat(["13/02/2026", "2026-02-01"])).toBeNull();
  });
});
