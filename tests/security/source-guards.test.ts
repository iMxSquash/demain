import { describe, expect, it } from "vitest";

import { readSourceFiles } from "../source-files";

// Everything that can talk to another machine, from Node or from the browser.
const OUTBOUND_CALL =
  /\bfetch\b|(?:from|import|require)\s*\(?\s*["'](?:node:)?(?:https?|http2|net|tls|dgram|dns)["']|XMLHttpRequest|WebSocket|EventSource|sendBeacon|https?:\/\//;

/** The only places allowed to reach out, each one opt-in or same-origin. */
const OUTBOUND_ALLOWED = new Set([
  // The ECB feed: refused unless the owner enabled it, then called on their click.
  "src/ledger/exchange-rates.ts",
  "src/app/currencies/actions.ts",
  // Posts the backup form to the app's own download routes.
  "src/app/backup/download-form.tsx",
]);

/** Startup failure of a missing variable: it prints the names of the variables, never data. */
const LOG_ALLOWED = new Set(["src/instrumentation-node.ts"]);

// A constant message: nothing interpolated, so no label or amount can end up in a log. The
// string must be the whole first argument, with no escaped quote that could end it early.
const CONSTANT_ERROR_LOG = /^console\.error\(\s*"[^"\\$`]*"\s*[,)]/;

const FILES = readSourceFiles("src");

// A call broken over several lines (as Prettier prints a long one) ends its first line
// with the parenthesis: its first argument is on the next code line.
const OPEN_CALL = /^console\.\w+\($/;

function isUnsafeLog(text: string, nextText: string): boolean {
  const start = text.indexOf("console.");
  if (start === -1) return false;
  const call = text.slice(start);
  return !CONSTANT_ERROR_LOG.test(OPEN_CALL.test(call) ? `${call}${nextText}` : call);
}

function offenders(
  allowed: Set<string>,
  isViolation: (text: string, nextText: string) => boolean,
): string[] {
  return FILES.filter(({ relative }) => !allowed.has(relative)).flatMap(({ relative, codeLines }) =>
    codeLines
      .filter(({ text }, index) => isViolation(text, codeLines[index + 1]?.text ?? ""))
      .map(({ line, text }) => `${relative}:${line}: ${text}`),
  );
}

describe("source guards", () => {
  it("finds the source files it is meant to scan", () => {
    expect(FILES.length).toBeGreaterThan(0);
  });

  it("makes no outbound call outside the documented opt-in features", () => {
    expect(offenders(OUTBOUND_ALLOWED, (text) => OUTBOUND_CALL.test(text))).toEqual([]);
  });

  it("accepts a constant error message, on one line or split over two", () => {
    expect(isUnsafeLog('console.error("Import failed", error);', "")).toBe(false);
    expect(isUnsafeLog('console.error("Import failed");', "")).toBe(false);
    expect(isUnsafeLog("console.error(", '"Import failed:",')).toBe(false);
  });

  it("refuses a log that is not a constant error message", () => {
    expect(isUnsafeLog('console.log("Import failed");', "")).toBe(true);
    expect(isUnsafeLog("console.log(", '"Import failed",')).toBe(true);
    expect(isUnsafeLog("console.error(", "label,")).toBe(true);
    expect(isUnsafeLog("console.error(", "`Import of ${label} failed`,")).toBe(true);
    expect(isUnsafeLog("console.error(", '"Import of " + label,')).toBe(true);
    expect(isUnsafeLog('console.error("Import of " + label);', "")).toBe(true);
    expect(isUnsafeLog('console.error("a".concat(label));', "")).toBe(true);
    expect(isUnsafeLog('console.error("\\",", label);', "")).toBe(true);
    expect(isUnsafeLog("console.error(", "")).toBe(true);
  });

  it("logs only errors, with a constant message", () => {
    expect(offenders(LOG_ALLOWED, isUnsafeLog)).toEqual([]);
  });
});
