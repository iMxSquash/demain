import { describe, expect, it } from "vitest";

import {
  decodeImportFile,
  detectImportFormat,
  mappingToFields,
  readColumnChoices,
  readMappingFields,
  toImportView,
} from "../../../src/app/imports/import-form-data";
import type { CsvMapping } from "../../../src/domain/import-csv";

const MAPPING: CsvMapping = {
  delimiter: ";",
  hasHeader: true,
  dateColumn: 0,
  dateFormat: "dmy",
  labelColumn: 1,
  amount: { kind: "split", debitColumn: 2, creditColumn: 3 },
};

function formOf(fields: Record<string, string>, omitted: string[] = []): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (!omitted.includes(key)) formData.set(key, value);
  }
  return formData;
}

const FORM_FIELDS = {
  mappingPresent: "1",
  delimiter: ";",
  hasHeader: "on",
  dateColumn: "1",
  dateFormat: "dmy",
  labelColumn: "2",
  amountKind: "split",
  debitColumn: "3",
  creditColumn: "4",
};

describe("decodeImportFile", () => {
  it("reads UTF-8", () => {
    const bytes = new TextEncoder().encode("Café");

    expect(decodeImportFile(bytes.buffer as ArrayBuffer)).toBe("Café");
  });

  it("falls back to Windows-1252 for older bank exports", () => {
    const bytes = Uint8Array.from([0x43, 0x61, 0x66, 0xe9]);

    expect(decodeImportFile(bytes.buffer)).toBe("Café");
  });
});

describe("detectImportFormat", () => {
  it("recognizes OFX by its content, not by the file name", () => {
    expect(detectImportFormat("OFXHEADER:100\n<OFX>\n")).toBe("ofx");
    expect(detectImportFormat("Date;Label;Amount")).toBe("csv");
  });
});

describe("readMappingFields", () => {
  it("turns the numbered columns of the form into a mapping", () => {
    expect(readMappingFields(formOf(FORM_FIELDS))).toEqual(MAPPING);
  });

  it("round-trips through the form representation", () => {
    const fields = mappingToFields(MAPPING);

    expect(fields).toMatchObject({ dateColumn: "1", debitColumn: "3", creditColumn: "4" });
  });

  it("returns null when the mapping fields were not sent", () => {
    expect(readMappingFields(formOf(FORM_FIELDS, ["mappingPresent"]))).toBeNull();
  });

  it("returns null for a blank, zero or non-numeric column", () => {
    expect(readMappingFields(formOf({ ...FORM_FIELDS, dateColumn: "" }))).toBeNull();
    expect(readMappingFields(formOf({ ...FORM_FIELDS, dateColumn: "0" }))).toBeNull();
    expect(readMappingFields(formOf({ ...FORM_FIELDS, labelColumn: "a" }))).toBeNull();
  });

  it("returns null for an unknown delimiter or date format", () => {
    expect(readMappingFields(formOf({ ...FORM_FIELDS, delimiter: "|" }))).toBeNull();
    expect(readMappingFields(formOf({ ...FORM_FIELDS, dateFormat: "x" }))).toBeNull();
  });

  it("reads a single amount column and an unchecked header box", () => {
    const form = formOf({ ...FORM_FIELDS, amountKind: "single", amountColumn: "3" }, ["hasHeader"]);

    expect(readMappingFields(form)).toEqual({
      ...MAPPING,
      hasHeader: false,
      amount: { kind: "single", column: 2 },
    });
  });
});

describe("toImportView", () => {
  const CHECKING = {
    id: 1,
    name: "Checking",
    kind: "checking" as const,
    currency: "EUR",
    openingDate: "2026-01-01",
    openingBalance: 123_456,
    archived: false,
    depositCeiling: null,
    overflowAccountId: null,
  };
  const SAVINGS = {
    ...CHECKING,
    id: 2,
    name: "Savings",
    kind: "savings" as const,
    depositCeiling: 100_000,
    overflowAccountId: 3,
  };
  const BALANCES = [
    { id: 1, currency: "EUR", archived: false, balance: 123_456, ceiling: null, overflowAccountId: null },
    { id: 2, currency: "EUR", archived: false, balance: 90_000, ceiling: 100_000, overflowAccountId: 3 },
    { id: 3, currency: "EUR", archived: true, balance: 0, ceiling: null, overflowAccountId: null },
  ];

  it("gives the browser what it needs to choose an account and a category, and no more", () => {
    const view = toImportView(
      [CHECKING, SAVINGS],
      [{ id: 7, name: "Groceries", archived: false }],
      BALANCES,
    );

    expect(view.accounts).toEqual([
      { id: 1, name: "Checking", kind: "checking", currency: "EUR", archived: false, overflowAccountId: null },
      { id: 2, name: "Savings", kind: "savings", currency: "EUR", archived: false, overflowAccountId: 3 },
    ]);
    expect(view.categories).toEqual([{ id: 7, name: "Groceries" }]);
  });

  it("keeps the balances of every account, archived ones included, to follow the overflow chains", () => {
    const view = toImportView([CHECKING], [], BALANCES);

    expect(view.overflowAccounts).toEqual(BALANCES);
  });
});

describe("readColumnChoices", () => {
  it("leaves a role to the detection when the field is absent or empty", () => {
    expect(readColumnChoices(formOf({ typeColumn: "" }))).toEqual({});
  });

  it("reads a column number, 0-based, and the answer that the file has none", () => {
    expect(
      readColumnChoices(formOf({ typeColumn: "3", categoryColumn: "none", descriptionColumn: "0" })),
    ).toEqual({ typeColumn: 3, categoryColumn: null, descriptionColumn: 0 });
  });

  it("leaves to the detection anything that is not a column number", () => {
    expect(
      readColumnChoices(formOf({ typeColumn: "-1", paymentModeColumn: "1e3", categoryColumn: "9999" })),
    ).toEqual({});
  });
});
