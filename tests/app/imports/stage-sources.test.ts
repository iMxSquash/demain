import { describe, expect, it } from "vitest";

import type {
  ColumnChoiceFields,
  StagedFile,
} from "../../../src/app/imports/import-form-data";
import { stageSources } from "../../../src/app/imports/stage-sources";

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

describe("stageSources", () => {
  it("reads each file with its own column choices", async () => {
    const calls: [string, ColumnChoiceFields | undefined][] = [];

    const files = await stageSources(
      [source("a.csv"), source("b.csv")],
      { 0: TYPE_ON_FOURTH, 1: NO_CATEGORY },
      async (file, columns) => {
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
      { 1: NO_CATEGORY },
      async (file, columns) => {
        calls.push([file.name, columns]);
        return staged(file.name);
      },
    );

    expect(calls).toEqual([
      ["a.csv", undefined],
      ["b.csv", NO_CATEGORY],
    ]);
  });

  it("reads the files one after the other and reports the progress", async () => {
    const progress: [number, string][] = [];
    let running = 0;
    let maxRunning = 0;

    await stageSources(
      [source("a.csv"), source("b.csv")],
      {},
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
