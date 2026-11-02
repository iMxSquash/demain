/**
 * CSV reading and column mapping, for any bank. Pure functions: no database,
 * no clock. Amounts go through `parseAmount`, never through a float.
 */

import { isCalendarDate } from "./account";
import type { MessageRef } from "./message";
import type { DecimalMark } from "./money";
import {
  importParseError,
  ImportParseError,
  parseRowAmount,
  requireRowLabel,
  type ImportedRow,
} from "./import-row";

export const CSV_DELIMITERS = [";", ",", "\t"] as const;

export type CsvDelimiter = (typeof CSV_DELIMITERS)[number];

export const CSV_DATE_FORMATS = ["dmy", "mdy", "ymd"] as const;

export type CsvDateFormat = (typeof CSV_DATE_FORMATS)[number];

export type CsvAmountMapping =
  | { kind: "single"; column: number }
  | { kind: "split"; debitColumn: number; creditColumn: number };

/** Where each piece of a movement sits in the file; columns are 0-based. */
export interface CsvMapping {
  delimiter: CsvDelimiter;
  /** The first row names the columns and holds no movement. */
  hasHeader: boolean;
  dateColumn: number;
  dateFormat: CsvDateFormat;
  labelColumn: number;
  amount: CsvAmountMapping;
  /** The mark every amount of the file uses; without it, each amount is read on its own. */
  decimalMark?: DecimalMark;
}

const BYTE_ORDER_MARK = "﻿";
// French bank exports use the semicolon, because the comma is their decimal mark.
const DEFAULT_DELIMITER: CsvDelimiter = ";";

/** The delimiter used by the first non-empty line, quoted cells left out. */
export function detectDelimiter(text: string): CsvDelimiter {
  const firstLine =
    text
      .replace(BYTE_ORDER_MARK, "")
      .split(/\r?\n/)
      .find((line) => line.trim() !== "") ?? "";
  const unquoted = firstLine.replace(/"[^"]*"/g, "");

  let best: CsvDelimiter = DEFAULT_DELIMITER;
  let bestCount = 0;
  for (const delimiter of CSV_DELIMITERS) {
    const count = unquoted.split(delimiter).length - 1;
    if (count > bestCount) {
      best = delimiter;
      bestCount = count;
    }
  }
  return best;
}

/**
 * Splits CSV text into rows of cells (RFC 4180 quoting). Blank lines are
 * dropped; a quoted cell that never closes rejects the file.
 */
export function parseCsv(text: string, delimiter: CsvDelimiter): string[][] {
  const source = text.startsWith(BYTE_ORDER_MARK) ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let isQuoted = false;
  let line = 1;
  let quoteOpenedAtLine = 1;

  const endCell = (): void => {
    row.push(cell);
    cell = "";
  };
  const endRow = (): void => {
    endCell();
    // A blank line reads as a single empty cell.
    if (row.length > 1 || row[0] !== "") rows.push(row);
    row = [];
  };

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (isQuoted) {
      if (char === '"' && source[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') {
        isQuoted = false;
      } else {
        if (char === "\n") line += 1;
        cell += char;
      }
    } else if (char === '"' && cell === "") {
      isQuoted = true;
      quoteOpenedAtLine = line;
    } else if (char === delimiter) {
      endCell();
    } else if (char === "\n") {
      endRow();
      line += 1;
    } else if (char !== "\r") {
      cell += char;
    }
  }

  if (isQuoted) {
    throw importParseError(
      `A quoted cell opened at line ${quoteOpenedAtLine} is never closed`,
      "importCsvUnclosedQuote",
      undefined,
      quoteOpenedAtLine,
    );
  }
  if (cell !== "" || row.length > 0) endRow();
  return rows;
}

const DATE_PATTERN = /^(\d{1,4})[/.-](\d{1,4})[/.-](\d{1,4})$/;

function pad(value: string, length: number): string {
  return value.padStart(length, "0");
}

// Position of the year, month and day among the three numbers, per format.
const DATE_ORDER: Record<
  CsvDateFormat,
  readonly [year: number, month: number, day: number]
> = {
  ymd: [1, 2, 3],
  dmy: [3, 2, 1],
  mdy: [3, 1, 2],
};

// A two-digit year would be a guess about the century.
export function parseDate(text: string, format: CsvDateFormat): string | null {
  const parts = DATE_PATTERN.exec(text.trim());
  const [year, month, day] = DATE_ORDER[format].map(
    (position) => parts?.[position],
  );
  const date =
    year?.length === 4 && month !== undefined && day !== undefined
      ? `${year}-${pad(month, 2)}-${pad(day, 2)}`
      : null;
  return date !== null && isCalendarDate(date) ? date : null;
}

// A day and a month with nothing else: "13/01".
const YEARLESS_DATE_PATTERN = /^(\d{1,2})([/.-])(\d{1,2})$/;

/** Whether every filled cell is a day and a month with no year, and at least one is filled. */
export function datesLackYear(cells: readonly string[]): boolean {
  const filled = cells.map((cell) => cell.trim()).filter((cell) => cell !== "");
  return (
    filled.length > 0 &&
    filled.every((cell) => YEARLESS_DATE_PATTERN.test(cell))
  );
}

/** "13/01" becomes "13/01/2026"; any other text is returned as it is. */
export function completeDateYear(text: string, year: number): string {
  const match = YEARLESS_DATE_PATTERN.exec(text.trim());
  if (match === null) return text;
  const [, first = "", separator = "", second = ""] = match;
  return `${first}${separator}${second}${separator}${year}`;
}

export interface DateFormatDetection {
  format: CsvDateFormat;
  /** Several formats read every date: this one is the likeliest, to confirm. */
  isAmbiguous: boolean;
}

/**
 * The format that reads every date. When several do, the first of
 * `CSV_DATE_FORMATS` wins (French exports write the day first) and the result
 * is flagged. Null when no format reads them all, or without dates.
 */
export function detectDateFormat(
  dates: readonly string[],
): DateFormatDetection | null {
  const readable = CSV_DATE_FORMATS.filter((format) =>
    dates.every((text) => parseDate(text, format) !== null),
  );
  const [format] = readable;
  if (dates.length === 0 || format === undefined) return null;
  return { format, isAmbiguous: readable.length > 1 };
}

function readDate(text: string, format: CsvDateFormat, line: number): string {
  const date = parseDate(text, format);
  if (date === null) {
    throw importParseError(
      `Invalid date "${text}" at row ${line}`,
      "importCsvDateInvalid",
      { date: text },
      line,
    );
  }
  return date;
}

function readCell(
  row: readonly string[],
  column: number,
  line: number,
): string {
  const cell = row[column];
  if (cell === undefined) {
    throw importParseError(
      `Row ${line} has no column ${column + 1}`,
      "importCsvColumnMissing",
      { column: column + 1 },
      line,
    );
  }
  return cell.trim();
}

function readAmount(
  row: readonly string[],
  mapping: CsvAmountMapping,
  currency: string,
  line: number,
  decimalMark: DecimalMark | undefined,
): number {
  const parse = (text: string): number =>
    parseRowAmount(text, currency, line, decimalMark);
  if (mapping.kind === "single") {
    return parse(readCell(row, mapping.column, line));
  }

  const debit = readCell(row, mapping.debitColumn, line);
  const credit = readCell(row, mapping.creditColumn, line);
  if (debit !== "" && credit !== "") {
    throw importParseError(
      `Row ${line} has both a debit and a credit`,
      "importCsvDebitAndCredit",
      undefined,
      line,
    );
  }
  if (debit === "" && credit === "") {
    throw importParseError(
      `Row ${line} has neither a debit nor a credit`,
      "importCsvNoAmount",
      undefined,
      line,
    );
  }
  // The column decides the direction: a minus sign there is only a habit of some banks.
  return debit !== "" ? -Math.abs(parse(debit)) : Math.abs(parse(credit));
}

function readRow(
  row: readonly string[],
  mapping: CsvMapping,
  currency: string,
  line: number,
): ImportedRow {
  const label = requireRowLabel(readCell(row, mapping.labelColumn, line), line);
  const date = readDate(
    readCell(row, mapping.dateColumn, line),
    mapping.dateFormat,
    line,
  );
  const amount = readAmount(
    row,
    mapping.amount,
    currency,
    line,
    mapping.decimalMark,
  );
  return { date, amount, label, externalId: null };
}

export interface CsvReading {
  rows: ImportedRow[];
  /** One entry per rejected row, so that a single bad row does not hide the others. */
  errors: ImportParseError[];
}

/** Applies a mapping to parsed rows; `line` in the errors is the row number in the file. */
export function applyCsvMapping(
  rows: readonly (readonly string[])[],
  mapping: CsvMapping,
  currency: string,
): CsvReading {
  const reading: CsvReading = { rows: [], errors: [] };
  rows.forEach((row, index) => {
    if (index === 0 && mapping.hasHeader) return;
    try {
      reading.rows.push(readRow(row, mapping, currency, index + 1));
    } catch (error) {
      if (!(error instanceof ImportParseError)) throw error;
      reading.errors.push(error);
    }
  });
  return reading;
}

export interface ChosenMapping {
  mapping: CsvMapping;
  reading: CsvReading;
}

/**
 * Applies the candidate mappings and keeps the one that reads the file with the
 * fewest errors, the earlier candidate winning a tie. When none reads it whole,
 * the problems of the best one can be shown and fixed. Null without candidate.
 */
export function chooseCsvMapping(
  rows: readonly (readonly string[])[],
  candidates: readonly CsvMapping[],
  currency: string,
): ChosenMapping | null {
  let best: ChosenMapping | null = null;
  for (const mapping of candidates) {
    const reading = applyCsvMapping(rows, mapping, currency);
    if (best === null || reading.errors.length < best.reading.errors.length) {
      best = { mapping, reading };
    }
  }
  return best;
}

// Lowercase, without accents or punctuation: "Date de l'opération" -> "datedeloperation".
export function normalizeHeader(header: string): string {
  return header
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function findColumn(
  headers: readonly string[],
  words: readonly string[],
): number {
  return headers.findIndex((header) =>
    words.some((word) => header.includes(word)),
  );
}

/** What the headers name, role by role: null for a role no header names. */
export interface SuggestedColumns {
  dateColumn: number | null;
  labelColumn: number | null;
  amount: CsvAmountMapping | null;
}

export function suggestMappingColumns(
  headerRow: readonly string[],
): SuggestedColumns {
  const headers = headerRow.map(normalizeHeader);
  const orNull = (column: number): number | null =>
    column === -1 ? null : column;
  const debitColumn = findColumn(headers, ["debit"]);
  const creditColumn = findColumn(headers, ["credit"]);
  const amountColumn = findColumn(headers, ["montant", "amount", "somme"]);

  return {
    dateColumn: orNull(findColumn(headers, ["date"])),
    labelColumn: orNull(
      findColumn(headers, [
        "libelle",
        "label",
        "description",
        "intitule",
        "detail",
        "memo",
        "payee",
      ]),
    ),
    amount:
      debitColumn !== -1 && creditColumn !== -1
        ? { kind: "split", debitColumn, creditColumn }
        : amountColumn !== -1
          ? { kind: "single", column: amountColumn }
          : null,
  };
}

/**
 * Guesses a mapping from the header row, so that a first import starts with
 * a sensible form. Returns null when the headers do not name the essentials.
 */
export function suggestCsvMapping(
  headerRow: readonly string[],
  delimiter: CsvDelimiter,
): CsvMapping | null {
  const { dateColumn, labelColumn, amount } = suggestMappingColumns(headerRow);
  if (dateColumn === null || labelColumn === null || amount === null) {
    return null;
  }

  return {
    delimiter,
    hasHeader: true,
    dateColumn,
    dateFormat: "dmy",
    labelColumn,
    amount,
  };
}

/** A problem with the file as a whole: nothing can be read from it. */
export type CsvFileIssue =
  | { kind: "emptyFile" }
  /** One cell per row: the delimiter was a fallback, not a finding. */
  | { kind: "delimiterNotFound" }
  | { kind: "unreadableFile"; ref: MessageRef; line: number | null };

export type CsvFile =
  | { delimiter: CsvDelimiter; table: string[][] }
  | { delimiter: CsvDelimiter; issue: CsvFileIssue };

/**
 * Splits a file into rows of cells, or says why it cannot be done. `delimiter`
 * is the one the user chose after a `delimiterNotFound`; without it, the
 * delimiter is detected from the file.
 */
export function parseCsvFile(
  text: string,
  delimiter: CsvDelimiter = detectDelimiter(text),
): CsvFile {
  let table: string[][];
  try {
    table = parseCsv(text, delimiter);
  } catch (error) {
    if (!(error instanceof ImportParseError)) throw error;
    return {
      delimiter,
      issue: { kind: "unreadableFile", ref: error.ref, line: error.line },
    };
  }

  if (table.length === 0) return { delimiter, issue: { kind: "emptyFile" } };
  if (table.every((row) => row.length === 1)) {
    return { delimiter, issue: { kind: "delimiterNotFound" } };
  }
  return { delimiter, table };
}
