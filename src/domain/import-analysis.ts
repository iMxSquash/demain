/**
 * Reads a CSV file the way a person would: separator, header, which column
 * holds what, in which format the dates are written. Pure functions: no
 * database, no clock. Whatever cannot be settled is reported in `issues`,
 * never dropped: the preview shows each one and the user decides.
 */

import {
  findHeaderIndex,
  isTotalRow,
  movementColumns,
  widestRowLength,
} from "./import-blocks";
import {
  detectColumnRoles,
  type ColumnChoices,
  type ColumnIssue,
} from "./import-columns";
import {
  CSV_DATE_FORMATS,
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
import {
  detectDecimalMark,
  type DecimalMark,
  type DecimalMarkDetection,
} from "./money";

export type AnalysisIssue =
  | { kind: "mappingColumnNotFound"; role: "date" | "label" | "amount" }
  | CsvFileIssue
  /** No format reads every date: the mapping keeps a provisional one. */
  | { kind: "dateFormatNotFound" }
  /** Several formats read every date: this is the likeliest one, to confirm. */
  | { kind: "dateFormatAmbiguous"; format: CsvDateFormat }
  /** The dates have no year and none was given: the user has to provide it. */
  | { kind: "dateYearMissing" }
  /** Columns beside the table (a monthly summary, for instance) hold other things: they are left out. */
  | { kind: "columnsIgnored"; columns: number[] }
  /** Lines that are no movement: those above the header, or the totals. */
  | { kind: "rowsIgnored"; reason: "beforeHeader" | "total"; lines: number[] }
  /** The amounts disagree on the decimal mark: this is the likeliest one, to confirm. */
  | { kind: "numberFormatAmbiguous"; mark: DecimalMark }
  | ColumnIssue;

export interface RoleColumn {
  /** 0-based. */
  column: number;
  /** The header cell, empty when the column has none. */
  header: string;
}

export interface CsvAnalysis {
  delimiter: CsvDelimiter;
  /** Null when the date, label or amount column is not found: see `issues`. */
  mapping: CsvMapping | null;
  typeColumn: number | null;
  paymentModeColumn: number | null;
  categoryColumn: number | null;
  /** Free text beside the label, named by its header: not an issue when absent. */
  descriptionColumn: number | null;
  /** The columns of the table that hold none of the date, label and amount: what an optional role can be given to. */
  roleColumns: RoleColumn[];
  /** 0-based index of the header row; the lines above it are ignored. */
  headerIndex: number;
  /** 1-based lines of the file that are no movement: above the header, totals, and lines holding only what is beside the table. */
  ignoredLines: number[];
  /** The year added to dates written without one; null when they carry their own. */
  yearApplied: number | null;
  issues: AnalysisIssue[];
}

function amountColumns(amount: CsvAmountMapping | null): number[] {
  if (amount === null) return [];
  return amount.kind === "single"
    ? [amount.column]
    : [amount.debitColumn, amount.creditColumn];
}

const isBlank = (cells: readonly string[]): boolean =>
  cells.every((cell) => cell.trim() === "");

interface TableLayout {
  /** The header and the lines under it with what is out of the table emptied, not removed: line numbers stay right. */
  header: string[];
  rows: string[][];
  /** Lines (1-based) above the header. */
  aboveHeaderLines: number[];
  /** Lines (1-based) of the file that are no movement, those above the header included. */
  ignoredLines: number[];
  totalLines: number[];
  ignoredColumns: number[];
  /** Columns of the table, in or out of the block, with their header cell. */
  tableColumns: RoleColumn[];
}

/**
 * Tells the table of movements from what surrounds it. `anchors` are the
 * date, label and amount columns, that the table holds; without them (a column
 * not found) nothing is left out but the lines above the header and the totals.
 */
function layoutTable(
  table: readonly (readonly string[])[],
  headerIndex: number,
  dateColumn: number | null,
  anchors: readonly number[] | null,
): TableLayout {
  const block = anchors === null ? null : movementColumns(table, headerIndex, anchors);
  const inBlock = (column: number): boolean =>
    block === null || (column >= block.first && column <= block.last);
  const clear = (cells: readonly string[]): string[] =>
    cells.map((cell, column) => (inBlock(column) ? cell : ""));
  // The format is not known yet: a total is a row that no format reads as a date.
  const isTotal = (cells: readonly string[]): boolean =>
    dateColumn !== null &&
    CSV_DATE_FORMATS.every((format) => isTotalRow(cells, dateColumn, format, inBlock));

  const firstLine = headerIndex + 2;
  const aboveHeaderLines = Array.from({ length: headerIndex }, (_, index) => index + 1);
  const ignoredLines = [...aboveHeaderLines];
  const totalLines: number[] = [];
  const rows = table.slice(headerIndex + 1).map((cells, index) => {
    const line = firstLine + index;
    const isTotalLine = isTotal(cells);
    const kept = isTotalLine ? [] : clear(cells);
    if (isBlank(kept)) ignoredLines.push(line);
    if (isTotalLine) totalLines.push(line);
    return kept;
  });

  const fromHeader = table.slice(headerIndex);
  const columnCount = widestRowLength(fromHeader);
  const ignoredColumns = Array.from({ length: columnCount }, (_, column) => column).filter(
    (column) =>
      !inBlock(column) &&
      fromHeader.some((cells) => (cells[column] ?? "").trim() !== ""),
  );
  const tableColumns = Array.from({ length: columnCount }, (_, column) => column)
    .filter(inBlock)
    .map((column) => ({
      column,
      header: (table[headerIndex]?.[column] ?? "").trim(),
    }));
  return {
    header: clear(table[headerIndex] ?? []),
    tableColumns,
    rows,
    aboveHeaderLines,
    ignoredLines,
    totalLines,
    ignoredColumns,
  };
}

/** What the layout left out, one issue per kind of leftover; none when nothing was. */
function layoutIssues(
  layout: TableLayout,
  decimalMark: DecimalMarkDetection | null,
): AnalysisIssue[] {
  const issues: AnalysisIssue[] = [];
  if (layout.aboveHeaderLines.length > 0) {
    issues.push({
      kind: "rowsIgnored",
      reason: "beforeHeader",
      lines: layout.aboveHeaderLines,
    });
  }
  if (layout.ignoredColumns.length > 0) {
    issues.push({ kind: "columnsIgnored", columns: layout.ignoredColumns });
  }
  if (layout.totalLines.length > 0) {
    issues.push({ kind: "rowsIgnored", reason: "total", lines: layout.totalLines });
  }
  if (decimalMark?.isAmbiguous === true) {
    issues.push({ kind: "numberFormatAmbiguous", mark: decimalMark.mark });
  }
  return issues;
}

function analyzeTable(
  table: readonly (readonly string[])[],
  delimiter: CsvDelimiter,
  year: number | undefined,
  choices: ColumnChoices,
): CsvAnalysis {
  const headerIndex = findHeaderIndex(table);
  const { dateColumn, labelColumn, amount } = suggestMappingColumns(
    table[headerIndex] ?? [],
  );
  const mappedColumns = [
    ...(dateColumn === null ? [] : [dateColumn]),
    ...(labelColumn === null ? [] : [labelColumn]),
    ...amountColumns(amount),
  ];
  const isEssentialFound =
    dateColumn !== null && labelColumn !== null && amount !== null;
  const layout = layoutTable(
    table,
    headerIndex,
    dateColumn,
    isEssentialFound ? mappedColumns : null,
  );
  // Lines emptied by the layout hold no movement, whatever they were.
  const rows = layout.rows.filter((cells) => !isBlank(cells));

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
  const amountCells = amountColumns(amount);
  const decimalMark = detectDecimalMark(
    rows.flatMap((row) => amountCells.map((column) => row[column] ?? "")),
  );
  const mapping: CsvMapping | null = isEssentialFound
    ? {
        delimiter,
        hasHeader: true,
        dateColumn,
        dateFormat: dateFormat?.format ?? "dmy",
        labelColumn,
        amount,
        ...(decimalMark === null ? {} : { decimalMark: decimalMark.mark }),
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

  const roles = detectColumnRoles(
    layout.rows,
    headerIndex + 2,
    mappedColumns,
    layout.header,
    choices,
  );

  return {
    delimiter,
    mapping,
    typeColumn: roles.typeColumn,
    paymentModeColumn: roles.paymentModeColumn,
    categoryColumn: roles.categoryColumn,
    descriptionColumn: roles.descriptionColumn,
    roleColumns: isEssentialFound
      ? layout.tableColumns.filter(({ column }) => !mappedColumns.includes(column))
      : [],
    headerIndex,
    ignoredLines: layout.ignoredLines,
    yearApplied,
    issues: [
      ...mappingIssues,
      ...dateIssues,
      ...layoutIssues(layout, decimalMark),
      ...roles.issues,
    ],
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
    descriptionColumn: null,
    roleColumns: [],
    headerIndex: 0,
    ignoredLines: [],
    yearApplied: null,
    issues: [issue],
  };
}

/** Analyzes a file that is already split into cells, so that a caller reading it too parses it once. */
export function analyzeCsvFile(
  file: CsvFile,
  year?: number,
  choices: ColumnChoices = {},
): CsvAnalysis {
  return "issue" in file
    ? unusable(file.delimiter, file.issue)
    : analyzeTable(file.table, file.delimiter, year, choices);
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
