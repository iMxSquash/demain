import path from "node:path";

import { describe, expect, it } from "vitest";

import { readSourceFiles } from "../source-files";

// The one native date input left in src is the no-JavaScript fallback that the DatePicker component renders.
const FALLBACK_FILE = path.join("src", "components", "date-picker.tsx");
const NATIVE_DATE_INPUT = /type=(?:"date"|'date'|\{["']date["']\})/;

describe("every date field of the app is the picker", () => {
  const files = readSourceFiles("src");

  it("scans the sources and finds the fallback", () => {
    const fallback = files.find(({ relative }) => relative === FALLBACK_FILE);

    expect(fallback?.codeLines.some(({ text }) => NATIVE_DATE_INPUT.test(text))).toBe(true);
  });

  it("finds no native date input outside the fallback", () => {
    const offenders = files
      .filter(({ relative }) => relative !== FALLBACK_FILE)
      .flatMap(({ relative, codeLines }) =>
        codeLines.filter(({ text }) => NATIVE_DATE_INPUT.test(text)).map(({ line }) => `${relative}:${line}`),
      );

    expect(offenders).toEqual([]);
  });
});
