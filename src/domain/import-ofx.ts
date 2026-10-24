/**
 * OFX reading, for the SGML flavor of OFX 1.x and the XML flavor of OFX 2.x.
 * The file is scanned for the few tags that matter and never run through an
 * XML parser: nothing in it can declare or expand an entity, load another
 * file or reach the network. See ARCHITECTURE, security.
 */

import { isCalendarDate } from "./account";
import {
  importParseError,
  parseRowAmount,
  requireRowLabel,
  type ImportedRow,
} from "./import-row";

const OFX_ROOT = /<OFX[\s>]/i;
// Built once: a statement of 100k movements would otherwise compile them 500k times.
const TAG_PATTERNS = Object.fromEntries(
  ["CURDEF", "DTPOSTED", "TRNAMT", "NAME", "MEMO", "FITID"].map((tag) => [
    tag,
    new RegExp(`<${tag}>([^<\\r\\n]*)`, "i"),
  ]),
) as Record<string, RegExp>;
const STATEMENT_TRANSACTION =
  /<STMTTRN>([\s\S]*?)(?=<\/STMTTRN>|<STMTTRN>|<\/BANKTRANLIST>|$)/gi;
const POSTED_DATE = /^(\d{4})(\d{2})(\d{2})/;

// Only the five entities XML defines are decoded, in a single pass so that
// "&amp;lt;" stays "&lt;". Entities declared by the file are left as text.
const ENTITIES: Readonly<Record<string, string>> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

function decodeEntities(value: string): string {
  return value.replace(
    /&(amp|lt|gt|quot|apos);/g,
    (_, name: string) => ENTITIES[name] ?? "",
  );
}

// An SGML value ends at the line break, an XML value at the next tag.
function readTag(block: string, tag: string): string | null {
  const match = TAG_PATTERNS[tag]?.exec(block);
  const value = match?.[1]?.trim();
  return value === undefined || value === "" ? null : decodeEntities(value);
}

/** Whether the text looks like an OFX statement, the test the importer routes files with. */
export function looksLikeOfx(text: string): boolean {
  return OFX_ROOT.test(text);
}

function readDate(block: string, line: number): string {
  const posted = readTag(block, "DTPOSTED");
  const match = posted === null ? null : POSTED_DATE.exec(posted);
  const date = match === null ? null : `${match[1]}-${match[2]}-${match[3]}`;
  if (date === null || !isCalendarDate(date)) {
    throw importParseError(
      `Invalid posting date "${posted ?? ""}" at line ${line}`,
      "importOfxDateInvalid",
      { date: posted ?? "" },
      line,
    );
  }
  return date;
}

function readAmount(block: string, currency: string, line: number): number {
  const text = readTag(block, "TRNAMT");
  if (text === null) {
    throw importParseError(
      `Missing amount at line ${line}`,
      "importOfxAmountMissing",
      undefined,
      line,
    );
  }
  return parseRowAmount(text, currency, line);
}

// NAME is the payee and MEMO the detail: banks split the same label between
// them differently, so both are kept.
function readLabel(block: string, line: number): string {
  const parts = [readTag(block, "NAME"), readTag(block, "MEMO")].filter(
    (part): part is string => part !== null,
  );
  return requireRowLabel([...new Set(parts)].join(" "), line);
}

/** Reads every transaction of an OFX statement; the first invalid one rejects the file. */
export function parseOfx(text: string, currency: string): ImportedRow[] {
  if (!looksLikeOfx(text)) {
    throw importParseError(
      "The file is not an OFX statement",
      "importOfxNotOfx",
    );
  }

  const statementCurrency = readTag(text, "CURDEF");
  if (
    statementCurrency !== null &&
    statementCurrency.toUpperCase() !== currency.toUpperCase()
  ) {
    throw importParseError(
      `The statement is in ${statementCurrency}, the account in ${currency}`,
      "importOfxCurrencyMismatch",
      { found: statementCurrency, expected: currency },
    );
  }

  // Matches come in file order, so lines are counted once over the whole text.
  let countedUpTo = 0;
  let line = 1;
  const rows = [...text.matchAll(STATEMENT_TRANSACTION)].map((match) => {
    for (
      let i = text.indexOf("\n", countedUpTo);
      i !== -1 && i < match.index;
      i = text.indexOf("\n", i + 1)
    ) {
      line += 1;
      countedUpTo = i + 1;
    }
    const block = match[1] ?? "";
    return {
      date: readDate(block, line),
      amount: readAmount(block, currency, line),
      label: readLabel(block, line),
      externalId: readTag(block, "FITID"),
    };
  });

  if (rows.length === 0) {
    throw importParseError(
      "The statement contains no transaction",
      "importOfxNoTransaction",
    );
  }
  return rows;
}
