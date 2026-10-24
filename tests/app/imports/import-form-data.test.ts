import { describe, expect, it } from "vitest";

import {
  decodeImportFile,
  detectImportFormat,
  mappingToFields,
  readMappingFields,
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
