/**
 * Reads a monthly tab of the sheet, exported as CSV, into typed rows. Pure
 * functions: no database, no clock. Whatever cannot be read is reported in
 * `issues` with its line, never dropped. See DOMAIN, section Migration from
 * the sheet.
 */

import { readPaymentMode, type MovementType } from "./import-columns";
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
import {
  DEFAULT_TYPE_VOCABULARY,
  amountsCarrySign,
  guessMovementType,
  type TypeSignals,
} from "./import-guess";
import type { ImportedRow } from "./import-row";
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
  /** Whether the amounts of the file say which way the money goes: else only the type column can. */
  isSigned: boolean;
}

const cellAt = (cells: readonly string[], column: number | null): string =>
  column === null ? "" : (cells[column] ?? "").trim();

// With a type column, the strict reading stays: a cell that is empty or unknown skips the row.
function readType(
  cells: readonly string[],
  line: number,
  imported: ImportedRow,
  context: TabContext,
): { type: MovementType } | { issue: SheetTabIssue } {
  const { typeColumn } = context.analysis;
  const typeCell = typeColumn === null ? null : cellAt(cells, typeColumn);
  const signals: TypeSignals = {
    typeCell,
    direction: context.isSigned ? (imported.amount < 0 ? "out" : "in") : null,
    directionSource: context.mapping.amount.kind === "split" ? "debitCredit" : "sign",
    // The migration decides the category after the type: it is not a clue here.
    category: null,
    label: imported.label,
  };
  const guess = guessMovementType(signals, {
    vocabulary: DEFAULT_TYPE_VOCABULARY,
    history: new Map(),
  });
  if (typeCell === null) return { type: guess.type };
  if (typeCell === "") return { issue: { kind: "typeMissing", line } };
  return guess.ignoredTypeCell === null
    ? { type: guess.type }
    : { issue: { kind: "typeUnrecognized", line, value: typeCell } };
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

  const typed = readType(cells, line, imported, context);
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

  // The header is line 1. All the rows are read first: whether the file is signed depends on all of them.
  const dataRows = file.table.slice(1).map(completeYear);
  const amounts = applyCsvMapping(
    dataRows,
    { ...mapping, hasHeader: false },
    options.currency,
  ).rows.map((row) => row.amount);
  const context: TabContext = {
    source: options.source,
    currency: options.currency,
    analysis,
    mapping,
    isSigned: amountsCarrySign(mapping.amount.kind, amounts),
  };

  const rows: SheetRow[] = [];
  const rowIssues: SheetTabIssue[] = [];
  dataRows.forEach((cells, index) => {
    const read = readTabRow(cells, index + 2, context);
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
