/**
 * Finds the table of movements in a CSV file that holds other things: lines
 * above the header, a summary beside the table, total rows. Pure functions: no
 * database, no clock. What is left out is reported by the caller, never
 * dropped silently.
 */

import {
  datesLackYear,
  normalizeHeader,
  parseDate,
  suggestMappingColumns,
  type CsvDateFormat,
} from "./import-csv";

/** First row naming date, label and amount (suggestMappingColumns); 0 when none does. */
export function findHeaderIndex(
  table: readonly (readonly string[])[],
): number {
  const index = table.findIndex((row) => {
    const { dateColumn, labelColumn, amount } = suggestMappingColumns(row);
    return dateColumn !== null && labelColumn !== null && amount !== null;
  });
  return Math.max(index, 0);
}

/**
 * Columns of the run holding every anchor, runs being split by columns empty
 * on every row from the header on. A column with a header and no value is not
 * empty, so it stays in the table. Null when the anchors are in different runs.
 */
export function movementColumns(
  table: readonly (readonly string[])[],
  headerIndex: number,
  anchors: readonly number[],
): { first: number; last: number } | null {
  const rows = table.slice(headerIndex);
  const columnCount = Math.max(0, ...rows.map((row) => row.length));
  const isFilled = Array.from({ length: columnCount }, (_, column) =>
    rows.some((row) => (row[column] ?? "").trim() !== ""),
  );

  const lowest = Math.min(...anchors);
  if (isFilled[lowest] !== true) return null;
  let first = lowest;
  while (isFilled[first - 1] === true) first -= 1;
  let last = lowest;
  while (isFilled[last + 1] === true) last += 1;
  return Math.max(...anchors) <= last ? { first, last } : null;
}

// Normalized with `normalizeHeader`: "Sous-total" is "soustotal".
const TOTAL_WORDS = [
  "total",
  "soustotal",
  "subtotal",
  "totaux",
  "solde",
  "balance",
  "sum",
];

/**
 * A row of totals or balances: its date cannot be read and a cell of the table
 * starts with a total word. A readable date keeps the row, as "TOTAL ENERGIES"
 * can be a real label; a date without a year is still a date.
 */
export function isTotalRow(
  cells: readonly string[],
  dateColumn: number,
  dateFormat: CsvDateFormat,
  inBlock: (column: number) => boolean,
): boolean {
  const date = cells[dateColumn] ?? "";
  if (parseDate(date, dateFormat) !== null || datesLackYear([date])) return false;

  return cells.some((cell, column) => {
    const text = normalizeHeader(cell);
    return inBlock(column) && TOTAL_WORDS.some((word) => text.startsWith(word));
  });
}
