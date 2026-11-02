/**
 * Reads a monthly tab of the sheet, exported as CSV, into typed rows. Pure
 * functions: no database, no clock. Whatever cannot be read is reported in
 * `issues` with its line, never dropped. See DOMAIN, section Migration from
 * the sheet.
 */

import type { CsvAnalysis } from "./import-analysis";
import {
  readMovementFile,
  type MovementFileIssue,
  type MovementFileOptions,
} from "./import-movements";
import type { SheetRow } from "./sheet-import";

export type SheetTabIssue =
  | MovementFileIssue
  /** The row is skipped: the type cell names no known type. */
  | { kind: "typeUnrecognized"; line: number; value: string }
  /** The row is skipped: the file has a type column and this cell is empty. */
  | { kind: "typeMissing"; line: number }
  /** The description was empty: the category stands for the label, for the user to check. */
  | { kind: "labelFromCategory"; line: number; category: string };

export type SheetTabOptions = Pick<
  MovementFileOptions,
  "currency" | "source" | "delimiter" | "year"
>;

export interface SheetTabReading {
  /** The file read: every issue below belongs to it. */
  source: string;
  rows: SheetRow[];
  /** What was understood of the file, for the preview. */
  analysis: CsvAnalysis;
  /** The issues of the file first, then those of the rows in the order of the file. */
  issues: SheetTabIssue[];
}

type RowIssue = Extract<SheetTabIssue, { line: number }>;

/**
 * Reads a monthly tab with the strict policy of the migration: with a type
 * column, a cell that is empty or unknown skips the row; the amount is the
 * absolute value, the sign being the type's; a savings row has no category.
 */
export function readSheetTab(
  text: string,
  options: SheetTabOptions,
): SheetTabReading {
  // The migration decides the category after the type: it is not a clue here.
  const reading = readMovementFile(text, { ...options, vocabulary: new Map() });
  const fileIssues = reading.issues.filter((issue) => issue.kind !== "rowUnreadable");
  const rowIssues: RowIssue[] = reading.issues.flatMap((issue) =>
    issue.kind === "rowUnreadable" ? [issue] : [],
  );

  const rows: SheetRow[] = [];
  for (const movement of reading.rows) {
    const { line, typeCell, type } = movement;
    if (typeCell === "") {
      rowIssues.push({ kind: "typeMissing", line });
      continue;
    }
    if (type.ignoredTypeCell !== null) {
      rowIssues.push({ kind: "typeUnrecognized", line, value: type.ignoredTypeCell });
      continue;
    }
    if (movement.labelFromCategory) {
      rowIssues.push({ kind: "labelFromCategory", line, category: movement.label });
    }
    rows.push({
      source: movement.source,
      line,
      date: movement.date,
      label: movement.label,
      amount: Math.abs(movement.amount),
      type: type.type,
      // A savings line is a transfer between accounts: it has no category.
      category: type.type === "savings" ? null : movement.category,
      paymentMode: movement.paymentMode,
    });
  }

  return {
    source: reading.source,
    rows,
    analysis: reading.analysis,
    issues: [...fileIssues, ...rowIssues.sort((a, b) => a.line - b.line)],
  };
}
