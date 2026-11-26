import { describe, expect, it } from "vitest";

import type { ColumnChoiceFields, StagedFile } from "../../../src/app/imports/import-form-data";
import { stageSources, stagingForm } from "../../../src/app/imports/stage-sources";
import { readMappingFields } from "../../../src/app/imports/import-form-data";
import type { CsvMapping } from "../../../src/domain/import-csv";

const HAND_MAPPING: CsvMapping = {
  delimiter: ";",
  hasHeader: false,
  dateColumn: 0,
  dateFormat: "dmy",
  labelColumn: 1,
  amount: { kind: "single", column: 2 },
};

const TYPE_ON_FOURTH: ColumnChoiceFields = {
  typeColumn: "3",
  paymentModeColumn: "none",
  categoryColumn: "none",
  descriptionColumn: "none",
};
const NO_CATEGORY: ColumnChoiceFields = {
  typeColumn: "none",
  paymentModeColumn: "none",
  categoryColumn: "none",
  descriptionColumn: "none",
};

function source(name: string): File {
  return new File(["date;label;amount"], name);
}

function staged(fileName: string): StagedFile {
  return {
    fileName,
    status: "ready",
    message: "",
    format: "csv",
    mapping: null,
    currency: "EUR",
    firstDate: null,
    needsMapping: false,
    columns: null,
    rows: [],
  };
}

describe("stagingForm", () => {
  it("sends the account, the file, the column choices and the mapping set by hand", () => {
    const file = source("a.csv");

    const form = stagingForm(file, "1", { columns: TYPE_ON_FOURTH, mapping: HAND_MAPPING });

    expect(form.get("accountId")).toBe("1");
    expect(form.get("file")).toBe(file);
    expect(form.get("typeColumn")).toBe("3");
    expect(readMappingFields(form)).toEqual(HAND_MAPPING);
  });

  it("sends no mapping for a file the user mapped nothing for", () => {
    expect(readMappingFields(stagingForm(source("a.csv"), "1", {}))).toBeNull();
  });
});

describe("stageSources", () => {
  it("reads each file with its own column choices", async () => {
    const calls: [string, ColumnChoiceFields | undefined][] = [];

    const files = await stageSources(
      [source("a.csv"), source("b.csv")],
      { columns: { 0: TYPE_ON_FOURTH, 1: NO_CATEGORY }, mappings: {} },
      async (file, { columns }) => {
        calls.push([file.name, columns]);
        return staged(file.name);
      },
    );

    expect(calls).toEqual([
      ["a.csv", TYPE_ON_FOURTH],
      ["b.csv", NO_CATEGORY],
    ]);
    expect(files.map((file) => file.fileName)).toEqual(["a.csv", "b.csv"]);
  });

  it("leaves the detection to a file the user chose no column for", async () => {
    const calls: [string, ColumnChoiceFields | undefined][] = [];

    await stageSources(
      [source("a.csv"), source("b.csv")],
      { columns: { 1: NO_CATEGORY }, mappings: {} },
      async (file, { columns }) => {
        calls.push([file.name, columns]);
        return staged(file.name);
      },
    );

    expect(calls).toEqual([
      ["a.csv", undefined],
      ["b.csv", NO_CATEGORY],
    ]);
  });

  it("reads a file mapped by hand with its own mapping, and the others without", async () => {
    const calls: [string, CsvMapping | undefined][] = [];

    await stageSources(
      [source("a.csv"), source("b.csv")],
      { columns: { 1: NO_CATEGORY }, mappings: { 1: HAND_MAPPING } },
      async (file, { mapping }) => {
        calls.push([file.name, mapping]);
        return staged(file.name);
      },
    );

    expect(calls).toEqual([
      ["a.csv", undefined],
      ["b.csv", HAND_MAPPING],
    ]);
  });

  it("reads the files one after the other and reports the progress", async () => {
    const progress: [number, string][] = [];
    let running = 0;
    let maxRunning = 0;

    await stageSources(
      [source("a.csv"), source("b.csv")],
      { columns: {}, mappings: {} },
      async (file) => {
        running += 1;
        maxRunning = Math.max(maxRunning, running);
        await Promise.resolve();
        running -= 1;
        return staged(file.name);
      },
      (current, file) => progress.push([current, file.name]),
    );

    expect(maxRunning).toBe(1);
    expect(progress).toEqual([
      [1, "a.csv"],
      [2, "b.csv"],
    ]);
  });
});
