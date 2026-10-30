import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const SOURCE_DIR = path.join(process.cwd(), "src");

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

// A constant message: nothing interpolated, so no label or amount can end up in a log.
const CONSTANT_ERROR_LOG = /^console\.error\(\s*"[^"$`]*"/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

interface SourceFile {
  relative: string;
  /** Code lines only: comments are prose, not calls. */
  lines: { line: number; text: string }[];
}

const FILES: SourceFile[] = sourceFiles(SOURCE_DIR).map((file) => ({
  relative: path.relative(process.cwd(), file),
  lines: readFileSync(file, "utf8")
    .split("\n")
    .map((text, index) => ({ line: index + 1, text: text.trim() }))
    .filter(({ text }) => !/^(\/\/|\/\*|\*)/.test(text)),
}));

function offenders(allowed: Set<string>, isViolation: (text: string) => boolean): string[] {
  return FILES.filter(({ relative }) => !allowed.has(relative)).flatMap(({ relative, lines }) =>
    lines
      .filter(({ text }) => isViolation(text))
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

  it("logs only errors, with a constant message", () => {
    const isUnsafeLog = (text: string) => {
      const start = text.indexOf("console.");
      return start !== -1 && !CONSTANT_ERROR_LOG.test(text.slice(start));
    };

    expect(offenders(LOG_ALLOWED, isUnsafeLog)).toEqual([]);
  });
});
