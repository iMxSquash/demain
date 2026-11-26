import path from "node:path";

import { describe, expect, it } from "vitest";

import { readSourceFiles } from "../source-files";

// The one native select left in src is the no-JavaScript fallback that the Select component renders.
const FALLBACK_FILE = path.join("src", "components", "select.tsx");
const NATIVE_SELECT = /<select\b/;

describe("every select of the app is the picker", () => {
  const files = readSourceFiles("src");

  it("scans the sources and finds the fallback", () => {
    const fallback = files.find(({ relative }) => relative === FALLBACK_FILE);

    expect(fallback?.codeLines.some(({ text }) => NATIVE_SELECT.test(text))).toBe(true);
  });

  it("finds no native select outside the fallback", () => {
    const offenders = files
      .filter(({ relative }) => relative !== FALLBACK_FILE)
      .flatMap(({ relative, codeLines }) =>
        codeLines
          .filter(({ text }) => NATIVE_SELECT.test(text))
          .map(({ line }) => `${relative}:${line}`),
      );

    expect(offenders).toEqual([]);
  });
});
