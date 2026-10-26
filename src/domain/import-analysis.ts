/**
 * Reads a CSV file the way a person would: separator, header, which column
 * holds what, in which format the dates are written. Pure functions: no
 * database, no clock. Whatever cannot be settled is reported in `issues`,
 * never dropped: the preview shows each one and the user decides.
 */

import { detectColumnRoles, type ColumnIssue } from "./import-columns";
import {
  completeDateYear,
  datesLackYear,
  detectDateFormat,
  parseCsvFile,
  suggestMappingColumns,
  type CsvAmountMapping,
  type CsvDateFormat,
  type CsvDelimiter,
  type CsvFile,
  type CsvFileIssue,
  type CsvMapping,
} from "./import-csv";

export type AnalysisIssue =
  | { kind: "mappingColumnNotFound"; role: "date" | "label" | "amount" }
  | CsvFileIssue
  /** No format reads every date: the mapping keeps a provisional one. */
  | { kind: "dateFormatNotFound" }
  /** Several formats read every date: this is the likeliest one, to confirm. */
  | { kind: "dateFormatAmbiguous"; format: CsvDateFormat }
  /** The dates have no year and none was given: the user has to provide it. */
  | { kind: "dateYearMissing" }
  | ColumnIssue;

export interface CsvAnalysis {
  delimiter: CsvDelimiter;
  /** Null when the date, label or amount column is not found: see `issues`. */
  mapping: CsvMapping | null;
  typeColumn: number | null;
  paymentModeColumn: number | null;
  categoryColumn: number | null;
  /** The year added to dates written without one; null when they carry their own. */
  yearApplied: number | null;
  issues: AnalysisIssue[];
}

// The header sits on line 1, so the first movement is on line 2.
const FIRST_DATA_LINE = 2;

function amountColumns(amount: CsvAmountMapping | null): number[] {
  if (amount === null) return [];
  return amount.kind === "single"
    ? [amount.column]
    : [amount.debitColumn, amount.creditColumn];
}

function analyzeTable(
  table: readonly (readonly string[])[],
  delimiter: CsvDelimiter,
  year: number | undefined,
): CsvAnalysis {
  const [header = [], ...rows] = table;
  const { dateColumn, labelColumn, amount } = suggestMappingColumns(header);

  const dateCells =
    dateColumn === null ? [] : rows.map((row) => row[dateColumn] ?? "");
  const lacksYear = datesLackYear(dateCells);
  const yearApplied = lacksYear && year !== undefined ? year : null;
  const dates =
    yearApplied === null
      ? dateCells
      : dateCells.map((cell) => completeDateYear(cell, yearApplied));
  // Without a year the format cannot be read yet: the missing year is the issue to report.
  const dateFormat = lacksYear && year === undefined ? null : detectDateFormat(dates);
  const mapping: CsvMapping | null =
    dateColumn !== null && labelColumn !== null && amount !== null
      ? {
          delimiter,
          hasHeader: true,
          dateColumn,
          dateFormat: dateFormat?.format ?? "dmy",
          labelColumn,
          amount,
        }
      : null;

  const mappingIssues: AnalysisIssue[] = (
    [
      ["date", dateColumn],
      ["label", labelColumn],
      ["amount", amount],
    ] as const
  )
    .filter(([, found]) => found === null)
    .map(([role]) => ({ kind: "mappingColumnNotFound", role }));

  const dateIssues: AnalysisIssue[] =
    dateColumn === null
      ? []
      : lacksYear && year === undefined
        ? [{ kind: "dateYearMissing" }]
        : dateFormat === null
        ? [{ kind: "dateFormatNotFound" }]
        : dateFormat.isAmbiguous
          ? [{ kind: "dateFormatAmbiguous", format: dateFormat.format }]
          : [];

  const roles = detectColumnRoles(rows, FIRST_DATA_LINE, [
    ...(dateColumn === null ? [] : [dateColumn]),
    ...(labelColumn === null ? [] : [labelColumn]),
    ...amountColumns(amount),
  ]);

  return {
    delimiter,
    mapping,
    typeColumn: roles.typeColumn,
    paymentModeColumn: roles.paymentModeColumn,
    categoryColumn: roles.categoryColumn,
    yearApplied,
    issues: [...mappingIssues, ...dateIssues, ...roles.issues],
  };
}

/** A file-level problem leaves nothing to analyze: it is the only thing to report. */
function unusable(delimiter: CsvDelimiter, issue: AnalysisIssue): CsvAnalysis {
  return {
    delimiter,
    mapping: null,
    typeColumn: null,
    paymentModeColumn: null,
    categoryColumn: null,
    yearApplied: null,
    issues: [issue],
  };
}

/** Analyzes a file that is already split into cells, so that a caller reading it too parses it once. */
export function analyzeCsvFile(file: CsvFile, year?: number): CsvAnalysis {
  return "issue" in file
    ? unusable(file.delimiter, file.issue)
    : analyzeTable(file.table, file.delimiter, year);
}

/**
 * `delimiter` is the one the user chose after a `delimiterNotFound`; without
 * it, the delimiter is detected from the file. `year` completes dates written
 * without one; without it they are reported as `dateYearMissing`.
 */
export function analyzeCsv(
  text: string,
  delimiter?: CsvDelimiter,
  year?: number,
): CsvAnalysis {
  return analyzeCsvFile(parseCsvFile(text, delimiter), year);
}
