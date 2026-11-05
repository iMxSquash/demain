/**
 * Reads the sheet's Summary tab, exported as CSV, into the monthly figures
 * that the migration checks against. Pure functions: no database, no clock.
 * Whatever cannot be read is reported in `issues`, never dropped. Amounts are
 * stored as integer minor units and months as "YYYY-MM"; showing them as
 * "1 234,56 €" or "01/2026" is the front end's job. See DOMAIN, section
 * Migration from the sheet.
 */

import {
  normalizeHeader,
  parseCsvFile,
  type CsvDelimiter,
  type CsvFileIssue,
} from "./import-csv";
import { isCalendarDate } from "./account";
import { MoneyParseError, parseAmount } from "./money";
import type { SheetRow } from "./sheet-import";
import type { SheetMonth, VerifiedFigure } from "./sheet-verification";
import { monthOf, type Month } from "./synthesis";

/** A Summary row. The real account balance becomes a balance assertion, not a compared figure. */
export type SummaryMonth = SheetMonth & { realAccountBalance: number | null };

type SummaryColumn = "month" | VerifiedFigure | "realAccountBalance";

/** What the user has to look at: nothing is dropped without one of these. */
export type SummaryIssue =
  | CsvFileIssue
  | { kind: "columnNotFound"; column: SummaryColumn }
  | { kind: "unrecognizedColumn"; column: number; header: string }
  /** Several columns name the same figure: the first is read, `columns` lists them all. */
  | { kind: "ambiguousColumn"; column: SummaryColumn; columns: number[] }
  | { kind: "monthUnreadable"; line: number; text: string }
  /** A month in words, with no year in the cell and none given by the caller. */
  | { kind: "monthYearMissing"; line: number; text: string }
  /** The figure stays empty, which the verification then reports in turn. */
  | {
      kind: "amountUnreadable";
      line: number;
      column: SummaryColumn;
      text: string;
    };

export interface SummaryReading {
  months: SummaryMonth[];
  issues: SummaryIssue[];
}

export interface SummaryOptions {
  currency: string;
  /** Year of the tab, for months written without one ("January"). */
  year?: number;
  delimiter?: CsvDelimiter;
}

// Fixed order, so that the report reads the same every time.
const SUMMARY_COLUMNS: readonly SummaryColumn[] = [
  "month",
  "net",
  "savings",
  "cumulativeSavings",
  "cumulativeAccount",
  "savingsBalance",
  "realAccountBalance",
];

// Normalized spellings (see `normalizeHeader`) of the Summary headers, as named in DOMAIN.
const HEADER_NAMES: ReadonlyMap<string, SummaryColumn> = new Map([
  ["month", "month"],
  ["finalbalance", "net"],
  ["savings", "savings"],
  ["cumulativesavings", "cumulativeSavings"],
  ["cumulativeaccount", "cumulativeAccount"],
  ["realaccountbalance", "realAccountBalance"],
  ["realsavingsbalance", "savingsBalance"],
  // French equivalents: a name not listed here is reported, not guessed.
  ["mois", "month"],
  ["soldefinal", "net"],
  ["epargne", "savings"],
  ["epargnecumulee", "cumulativeSavings"],
  ["comptecumule", "cumulativeAccount"],
  ["comptereel", "realAccountBalance"],
  ["epargnereelle", "savingsBalance"],
]);

const MONTH_NAMES: ReadonlyMap<string, number> = new Map([
  ["january", 1],
  ["february", 2],
  ["march", 3],
  ["april", 4],
  ["may", 5],
  ["june", 6],
  ["july", 7],
  ["august", 8],
  ["september", 9],
  ["october", 10],
  ["november", 11],
  ["december", 12],
  ["janvier", 1],
  ["fevrier", 2],
  ["mars", 3],
  ["avril", 4],
  ["mai", 5],
  ["juin", 6],
  ["juillet", 7],
  ["aout", 8],
  ["septembre", 9],
  ["octobre", 10],
  ["novembre", 11],
  ["decembre", 12],
]);

const ISO_MONTH = /^(\d{4})-(\d{1,2})(?:-\d{1,2})?$/;
const NUMERIC_MONTH = /^(\d{1,2})[/.-](\d{4})$/;
const NAMED_MONTH = /^(\p{L}+)\.?\s*(\d{4})?$/u;

function toMonth(year: number, number: number): Month | null {
  if (number < 1 || number > 12) return null;
  return `${year}-${String(number).padStart(2, "0")}`;
}

/** The month a cell names, as "YYYY-MM", or why it cannot be read. */
function readMonthCell(
  text: string,
  defaultYear: number | undefined,
): Month | "unreadable" | "yearMissing" {
  const cell = text.trim();
  const iso = ISO_MONTH.exec(cell);
  if (iso !== null)
    return toMonth(Number(iso[1]), Number(iso[2])) ?? "unreadable";
  const numeric = NUMERIC_MONTH.exec(cell);
  if (numeric !== null) {
    return toMonth(Number(numeric[2]), Number(numeric[1])) ?? "unreadable";
  }

  const named = NAMED_MONTH.exec(cell);
  const number = MONTH_NAMES.get(normalizeHeader(named?.[1] ?? ""));
  if (number === undefined) return "unreadable";
  const year = named?.[2] === undefined ? defaultYear : Number(named[2]);
  return year === undefined
    ? "yearMissing"
    : (toMonth(year, number) ?? "unreadable");
}

export function readSheetSummary(
  text: string,
  options: SummaryOptions,
): SummaryReading {
  const file = parseCsvFile(text, options.delimiter);
  if ("issue" in file) return { months: [], issues: [file.issue] };

  const [header = [], ...rows] = file.table;
  const issues: SummaryIssue[] = [];
  const columnsOf = new Map<SummaryColumn, number[]>();
  header.forEach((cell, index) => {
    const column = HEADER_NAMES.get(normalizeHeader(cell));
    if (column === undefined) {
      issues.push({ kind: "unrecognizedColumn", column: index, header: cell });
    } else {
      columnsOf.set(column, [...(columnsOf.get(column) ?? []), index]);
    }
  });
  const columnOf = new Map<SummaryColumn, number>();
  for (const column of SUMMARY_COLUMNS) {
    const [first, ...others] = columnsOf.get(column) ?? [];
    if (first === undefined) {
      issues.push({ kind: "columnNotFound", column });
      continue;
    }
    columnOf.set(column, first);
    if (others.length > 0) {
      issues.push({
        kind: "ambiguousColumn",
        column,
        columns: [first, ...others],
      });
    }
  }
  // Without the month, a row cannot be told from another.
  if (!columnOf.has("month")) return { months: [], issues };

  const amountAt = (
    row: readonly string[],
    column: SummaryColumn,
    line: number,
  ): number | null => {
    const cell = (row[columnOf.get(column) ?? -1] ?? "").trim();
    if (cell === "") return null;
    try {
      return parseAmount(cell, options.currency);
    } catch (error) {
      if (!(error instanceof MoneyParseError)) throw error;
      issues.push({ kind: "amountUnreadable", line, column, text: cell });
      return null;
    }
  };

  const months: SummaryMonth[] = [];
  rows.forEach((row, index) => {
    const line = index + 2; // the header is line 1
    const text = row[columnOf.get("month") ?? -1] ?? "";
    const month = readMonthCell(text, options.year);
    if (month === "unreadable" || month === "yearMissing") {
      issues.push({
        kind: month === "unreadable" ? "monthUnreadable" : "monthYearMissing",
        line,
        text,
      });
      return;
    }
    months.push({
      month,
      net: amountAt(row, "net", line),
      savings: amountAt(row, "savings", line),
      cumulativeSavings: amountAt(row, "cumulativeSavings", line),
      cumulativeAccount: amountAt(row, "cumulativeAccount", line),
      savingsBalance: amountAt(row, "savingsBalance", line),
      realAccountBalance: amountAt(row, "realAccountBalance", line),
    });
  });
  return { months, issues };
}

/** The real account balance of a Summary month; null when the sheet reports none. */
export interface SummaryBalance {
  month: Month;
  /** Signed integer in minor units. */
  amount: number | null;
}

export type SummaryBalancesIssue =
  | SummaryIssue
  /** Only the first row of the month is kept. */
  | { kind: "monthDuplicated"; month: Month };

export interface SummaryBalancesReading {
  balances: SummaryBalance[];
  issues: SummaryBalancesIssue[];
}

// The other figures of the tab are the verification's business, not the balances'.
function concernsBalances(issue: SummaryIssue): boolean {
  if (!("column" in issue) || typeof issue.column !== "string") return true;
  return issue.column === "month" || issue.column === "realAccountBalance";
}

/**
 * The monthly real account balances of the Summary tab, to become balance
 * assertions. A month the sheet leaves without a balance stays in the list
 * with a null amount: it is not an error, and it is not dropped. The
 * separator is detected from the file unless the caller gives it.
 */
export function readSummaryBalances(
  text: string,
  options: SummaryOptions,
): SummaryBalancesReading {
  const reading = readSheetSummary(text, options);
  const issues: SummaryBalancesIssue[] = reading.issues.filter(concernsBalances);
  const balances: SummaryBalance[] = [];
  for (const { month, realAccountBalance } of reading.months) {
    if (balances.some((balance) => balance.month === month)) {
      issues.push({ kind: "monthDuplicated", month });
      continue;
    }
    balances.push({ month, amount: realAccountBalance });
  }
  return { balances, issues };
}

export interface SummaryScope {
  inScope: SummaryMonth[];
  /** Left out because they fall outside the period of the rows, and named so. */
  ignored: Month[];
}

/**
 * Keeps the Summary months from the first to the last month of the imported
 * rows: the months still to come, empty in the sheet, are not part of the
 * history. A row with an impossible date does not set the period.
 */
export function scopeSummary(
  months: readonly SummaryMonth[],
  rows: readonly SheetRow[],
): SummaryScope {
  // "YYYY-MM" strings sort chronologically.
  const rowMonths = rows
    .filter((row) => isCalendarDate(row.date))
    .map((row) => monthOf(row.date))
    .sort();
  const first = rowMonths[0];
  const last = rowMonths[rowMonths.length - 1];
  if (first === undefined || last === undefined) {
    return { inScope: [], ignored: months.map((entry) => entry.month) };
  }

  const isInScope = (entry: SummaryMonth) =>
    entry.month >= first && entry.month <= last;
  return {
    inScope: months.filter(isInScope),
    ignored: months.filter((entry) => !isInScope(entry)).map((entry) => entry.month),
  };
}
