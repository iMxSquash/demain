/**
 * Reads the movements of a CSV file, whatever the bank or the spreadsheet:
 * the layout is analyzed, then each row gets its date, label, signed amount
 * and, when the file has them, its type, category, payment mode and
 * description. Pure functions: no database, no clock. Whatever cannot be read
 * is reported with its line, never dropped. See DOMAIN, section Migration from
 * the sheet.
 */

import { readPaymentMode, type ColumnChoices } from "./import-columns";
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
  type LabelHistory,
  type TypeGuess,
  type TypeVocabulary,
} from "./import-guess";
import type { ImportedRow } from "./import-row";
import type { MessageRef } from "./message";
import type { PaymentMode } from "./transaction";

export interface MovementFileOptions {
  currency: string;
  /** Name of the file: its rows carry it, so that they can be told apart from other files'. */
  source: string;
  /** The one the user chose after a `delimiterNotFound`. */
  delimiter?: CsvDelimiter;
  /** Year of the dates written without one; else the one in the file name, if any. */
  year?: number;
  /** The columns the user assigned to the roles, over the detected ones. */
  columns?: ColumnChoices;
  /** Words of a category that give the type; the default one when absent. */
  vocabulary?: TypeVocabulary;
  /** Types of the labels already imported; empty when absent. */
  history?: LabelHistory;
}

export interface MovementRow {
  source: string;
  /** 1-based line of the file. */
  line: number;
  /** YYYY-MM-DD. */
  date: string;
  label: string;
  /** Signed as in the file, in minor units: negative leaves the account. */
  amount: number;
  /** The type cell as written; null when the file has no type column. */
  typeCell: string | null;
  type: TypeGuess;
  category: string | null;
  paymentMode: PaymentMode | null;
  description: string | null;
  /** The label cell was empty: the category stands for it. */
  labelFromCategory: boolean;
}

export type MovementFileIssue =
  | AnalysisIssue
  /** The row is skipped: its date, label or amount could not be read. */
  | { kind: "rowUnreadable"; line: number; ref: MessageRef }
  /** The dates had no year: the one in the file name was used, for the user to confirm. */
  | { kind: "dateYearAssumed"; year: number };

export interface MovementFileReading {
  /** The file read: every issue below belongs to it. */
  source: string;
  rows: MovementRow[];
  /** What was understood of the file, for the preview. */
  analysis: CsvAnalysis;
  /** The issues of the analysis first, then those of the rows. */
  issues: MovementFileIssue[];
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

const cellAt = (cells: readonly string[], column: number | null): string =>
  column === null ? "" : (cells[column] ?? "").trim();

const orNull = (text: string): string | null => (text === "" ? null : text);

/** A line once its date, label and amount are read, before the type is guessed. */
interface ReadLine {
  line: number;
  cells: readonly string[];
  imported: ImportedRow;
  labelFromCategory: boolean;
}

function readLine(
  cells: readonly string[],
  line: number,
  analysis: CsvAnalysis,
  mapping: CsvMapping,
  options: MovementFileOptions,
  yearApplied: number | null,
): ReadLine | { issue: MovementFileIssue } {
  const category = cellAt(cells, analysis.categoryColumn);
  const labelFromCategory = cellAt(cells, mapping.labelColumn) === "" && category !== "";
  const prepared = cells.map((cell, column) => {
    if (column === mapping.dateColumn && yearApplied !== null) {
      return completeDateYear(cell, yearApplied);
    }
    return column === mapping.labelColumn && labelFromCategory ? category : cell;
  });

  // One row at a time, so that a bad row is told apart from the others.
  const reading = applyCsvMapping(
    [prepared],
    { ...mapping, hasHeader: false },
    options.currency,
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
  return { line, cells, imported, labelFromCategory };
}

export function readMovementFile(
  text: string,
  options: MovementFileOptions,
): MovementFileReading {
  const year = options.year ?? yearFromFileName(options.source);
  const file = parseCsvFile(text, options.delimiter);
  const analysis = analyzeCsvFile(file, year, options.columns);
  const { mapping, yearApplied } = analysis;
  // Without a year every date is unreadable: the one issue to report is the missing year.
  const isYearMissing = analysis.issues.some(
    (issue) => issue.kind === "dateYearMissing",
  );
  if (mapping === null || "issue" in file || isYearMissing) {
    return { source: options.source, rows: [], analysis, issues: analysis.issues };
  }

  const ignored = new Set(analysis.ignoredLines);
  const lines: ReadLine[] = [];
  const rowIssues: MovementFileIssue[] = [];
  file.table.forEach((cells, index) => {
    const line = index + 1;
    if (index <= analysis.headerIndex || ignored.has(line)) return;
    const read = readLine(cells, line, analysis, mapping, options, yearApplied);
    if ("issue" in read) rowIssues.push(read.issue);
    else lines.push(read);
  });

  // Whether the file is signed depends on all of its rows, so they are all read first.
  const isSigned = amountsCarrySign(
    mapping.amount.kind,
    lines.map(({ imported }) => imported.amount),
  );
  const context = {
    vocabulary: options.vocabulary ?? DEFAULT_TYPE_VOCABULARY,
    history: options.history ?? new Map(),
  };
  const rows = lines.map(({ line, cells, imported, labelFromCategory }): MovementRow => {
    const typeCell =
      analysis.typeColumn === null ? null : cellAt(cells, analysis.typeColumn);
    const category = orNull(cellAt(cells, analysis.categoryColumn));
    const paymentMode = orNull(cellAt(cells, analysis.paymentModeColumn));
    return {
      source: options.source,
      line,
      date: imported.date,
      label: imported.label,
      amount: imported.amount,
      typeCell,
      type: guessMovementType(
        {
          typeCell,
          direction: isSigned ? (imported.amount < 0 ? "out" : "in") : null,
          directionSource: mapping.amount.kind === "split" ? "debitCredit" : "sign",
          category,
          label: imported.label,
        },
        context,
      ),
      category,
      paymentMode: paymentMode === null ? null : readPaymentMode(paymentMode),
      description: orNull(cellAt(cells, analysis.descriptionColumn)),
      labelFromCategory,
    };
  });

  const yearIssues: MovementFileIssue[] =
    yearApplied !== null && options.year === undefined
      ? [{ kind: "dateYearAssumed", year: yearApplied }]
      : [];
  return {
    source: options.source,
    rows,
    analysis,
    issues: [...analysis.issues, ...yearIssues, ...rowIssues],
  };
}
