import { describe, expect, it } from "vitest";

import { readSourceFiles } from "../source-files";

// Database reads are cached behind one tag (ADR-023). A server action that writes and forgets to
// refresh it leaves a wrong figure on screen, which no other test would catch.

/** Actions that only touch the owner and the sessions, which no cached read holds. */
const AUTH_ACTIONS = new Set([
  "src/app/login/actions.ts",
  "src/app/security/actions.ts",
  "src/app/setup/actions.ts",
]);

// Comments are left out, so a mention of a call in prose never satisfies a guard.
const FILES = readSourceFiles("src/app").map(({ relative, text, codeLines }) => ({
  relative,
  isServerActionModule: text.startsWith('"use server";'),
  code: codeLines.map(({ text: line }) => line),
}));

const SERVER_ACTION_MODULES = FILES.filter(({ isServerActionModule }) => isServerActionModule);

function countOf(code: string[], line: string): number {
  return code.filter((text) => text === line).length;
}

function calls(code: string[], pattern: RegExp): boolean {
  return code.some((text) => pattern.test(text));
}

describe("data cache guards", () => {
  it("finds the server actions it is meant to check", () => {
    expect(SERVER_ACTION_MODULES.length).toBeGreaterThan(AUTH_ACTIONS.size);
  });

  it("refreshes the cached data in every server action module that opens the database", () => {
    const missing = SERVER_ACTION_MODULES.filter(
      ({ relative, code }) =>
        !AUTH_ACTIONS.has(relative) &&
        calls(code, /\bwithDatabase(Async)?\(/) &&
        !calls(code, /\brefreshData\(\)/),
    ).map(({ relative }) => relative);

    expect(missing).toEqual([]);
  });

  it("tags every cached read so that a write can refresh it", () => {
    const untagged = FILES.filter(
      ({ code }) => countOf(code, '"use cache";') !== countOf(code, "tagDataRead();"),
    ).map(({ relative }) => relative);

    expect(untagged).toEqual([]);
  });
});
