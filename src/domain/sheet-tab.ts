/**
 * Reads a monthly tab of the sheet, exported as CSV, into typed rows. Pure
 * functions: no database, no clock. Whatever cannot be read is reported in
 * `issues` with its line, never dropped. See DOMAIN, section Migration from
 * the sheet.
 */

import {
  readMovementType,
  readPaymentMode,
  type MovementType,
} from "./import-columns";
import {
  analyzeCsvFile,
  type AnalysisIssue,
  type CsvAnalysis,
} from "./import-analysis";
import {
  applyCsvMapping,
  completeDateYear,
  parseCsvFile,
  type CsvDelimiter,
  type CsvMapping,
} from "./import-csv";
import type { MessageRef } from "./message";
import type { SheetRow } from "./sheet-import";

export type SheetTabIssue =
  | AnalysisIssue
  /** The row is skipped: its date, label or amount could not be read. */
  | { kind: "rowUnreadable"; line: number; ref: MessageRef }
  /** The row is skipped: the type cell names no known type. */
  | { kind: "typeUnrecognized"; line: number; value: string }
  /** The row is skipped: the file has a type column and this cell is empty. */
  | { kind: "typeMissing"; line: number }
  /** The dates had no year: the one in the file name was used, for the user to confirm. */
  | { kind: "dateYearAssumed"; year: number };

export interface SheetTabOptions {
  currency: string;
  /** Name of the file: its rows carry it, so that they can be told apart from other files'. */
  source: string;
  /** The one the user chose after a `delimiterNotFound`. */
  delimiter?: CsvDelimiter;
  /** Year of the dates written without one; else the one in the file name, if any. */
  year?: number;
}

export interface SheetTabReading {
  /** The file read: every issue below belongs to it. */
  source: string;
  rows: SheetRow[];
  /** What was understood of the file, for the preview. */
  analysis: CsvAnalysis;
  /** The issues of the analysis first, then those of the rows. */
  issues: SheetTabIssue[];
}

// Exactly one four-digit year in the name ("january-2026.csv"): two years are no answer.
const YEAR_IN_NAME = /(?<!\d)((?:19|20)\d{2})(?!\d)/g;

function yearFromFileName(name: string): number | undefined {
  const years = new Set(
    [...name.matchAll(YEAR_IN_NAME)].map((match) => Number(match[1])),
  );
  const [year] = years;
  return years.size === 1 ? year : undefined;
}

/** What one row of the file gives: a typed row, or the reason why it is skipped. */
type TabRow = { row: SheetRow } | { issue: SheetTabIssue };

interface TabContext {
  source: string;
  currency: string;
  analysis: CsvAnalysis;
  mapping: CsvMapping;
}

const cellAt = (cells: readonly string[], column: number | null): string =>
  column === null ? "" : (cells[column] ?? "").trim();

// Without a type column the sign of the amount is all there is to go by.
function readType(
  cells: readonly string[],
  line: number,
  amount: number,
  typeColumn: number | null,
): { type: MovementType } | { issue: SheetTabIssue } {
  if (typeColumn === null) {
    return { type: amount < 0 ? "expense" : "income" };
  }
  const typeCell = cellAt(cells, typeColumn);
  if (typeCell === "") return { issue: { kind: "typeMissing", line } };
  const type = readMovementType(typeCell);
  return type === null
    ? { issue: { kind: "typeUnrecognized", line, value: typeCell } }
    : { type };
}

function readTabRow(
  cells: readonly string[],
  line: number,
  context: TabContext,
): TabRow {
  // One row at a time, so that a bad row is told apart from the others.
  const reading = applyCsvMapping(
    [cells],
    { ...context.mapping, hasHeader: false },
    context.currency,
  );
  const [error] = reading.errors;
  if (error !== undefined) {
    return { issue: { kind: "rowUnreadable", line, ref: error.ref } };
  }
  const [imported] = reading.rows;
  // One row in gives exactly one row or one error out: anything else is a bug.
  if (imported === undefined) {
    throw new Error(`Row ${line} gave neither a movement nor an error`);
  }

  const typed = readType(cells, line, imported.amount, context.analysis.typeColumn);
  if ("issue" in typed) return typed;

  const category = cellAt(cells, context.analysis.categoryColumn);
  const paymentMode = cellAt(cells, context.analysis.paymentModeColumn);
  return {
    row: {
      source: context.source,
      line,
      date: imported.date,
      label: imported.label,
      amount: Math.abs(imported.amount),
      type: typed.type,
      // A savings line is a transfer between accounts: it has no category.
      category: typed.type === "savings" || category === "" ? null : category,
      paymentMode: paymentMode === "" ? null : readPaymentMode(paymentMode),
    },
  };
}

export function readSheetTab(
  text: string,
  options: SheetTabOptions,
): SheetTabReading {
  const year = options.year ?? yearFromFileName(options.source);
  const file = parseCsvFile(text, options.delimiter);
  const analysis = analyzeCsvFile(file, year);
  const { mapping, yearApplied } = analysis;
  // Without a year every date is unreadable: the one issue to report is the missing year.
  const isYearMissing = analysis.issues.some(
    (issue) => issue.kind === "dateYearMissing",
  );
  if (mapping === null || "issue" in file || isYearMissing) {
    return { source: options.source, rows: [], analysis, issues: analysis.issues };
  }

  const context = { source: options.source, currency: options.currency, analysis, mapping };
  const completeYear = (cells: readonly string[]): string[] =>
    cells.map((cell, column) =>
      yearApplied !== null && column === mapping.dateColumn
        ? completeDateYear(cell, yearApplied)
        : cell,
    );
  const yearIssues: SheetTabIssue[] =
    yearApplied !== null && options.year === undefined
      ? [{ kind: "dateYearAssumed", year: yearApplied }]
      : [];

  const rows: SheetRow[] = [];
  const rowIssues: SheetTabIssue[] = [];
  file.table.slice(1).forEach((cells, index) => {
    // The header is line 1.
    const read = readTabRow(completeYear(cells), index + 2, context);
    if ("row" in read) rows.push(read.row);
    else rowIssues.push(read.issue);
  });
  return {
    source: options.source,
    rows,
    analysis,
    issues: [...analysis.issues, ...yearIssues, ...rowIssues],
  };
}
