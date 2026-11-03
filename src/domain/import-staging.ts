/**
 * Rows of a statement as drafts to review before anything is recorded. Pure
 * functions: no database, no clock. A row the file cannot give as a movement
 * is kept with what the file says, so that the user fixes it instead of
 * losing it.
 */

import {
  applyCsvMapping,
  completeDateYear,
  parseCsvFile,
  parseDate,
  type CsvMapping,
} from "./import-csv";
import {
  detailsFromSign,
  draftOfRow,
  type ImportDraft,
  type RowDetails,
} from "./import-draft";
import { amountsCarrySign, type TypeGuess } from "./import-guess";
import {
  readMovementFile,
  type MovementFileOptions,
  type MovementFileReading,
  type MovementRow,
} from "./import-movements";
import { MoneyParseError, parseAmount } from "./money";

export interface StagedRow {
  /** 1-based line of the file, to find the row again. */
  line: number;
  draft: ImportDraft;
  /** The date as the file writes it, when the row's date could not be read. */
  rawDate: string | null;
}

function cell(row: readonly string[], column: number): string {
  return (row[column] ?? "").trim();
}

// A debit leaves the account; a minus sign already there is only a habit of some banks.
function unreadableAmount(row: readonly string[], mapping: CsvMapping): string {
  const { amount } = mapping;
  if (amount.kind === "single") return cell(row, amount.column);
  const debit = cell(row, amount.debitColumn);
  if (debit === "") return cell(row, amount.creditColumn);
  return debit.startsWith("-") ? debit : `-${debit}`;
}

function stageUnreadableRow(
  row: readonly string[],
  mapping: CsvMapping,
  line: number,
): StagedRow {
  const rawDate = cell(row, mapping.dateColumn);
  const date = parseDate(rawDate, mapping.dateFormat);
  return {
    line,
    rawDate: date === null ? rawDate : null,
    draft: {
      date: date ?? "",
      label: cell(row, mapping.labelColumn),
      amount: unreadableAmount(row, mapping),
      externalId: null,
    },
  };
}

function holdsMovement(row: readonly string[], mapping: CsvMapping): boolean {
  return (
    cell(row, mapping.dateColumn) !== "" ||
    cell(row, mapping.labelColumn) !== "" ||
    unreadableAmount(row, mapping) !== ""
  );
}

/** The data rows of a parsed CSV as drafts, in file order. Rows with no date, label or amount are skipped. */
export function stageCsvRows(
  table: readonly (readonly string[])[],
  mapping: CsvMapping,
  currency: string,
): StagedRow[] {
  const staged: StagedRow[] = [];
  const rowMapping = { ...mapping, hasHeader: false };
  table.forEach((row, index) => {
    if (index === 0 && mapping.hasHeader) return;
    if (!holdsMovement(row, mapping)) return;

    const line = index + 1;
    // One row at a time, so that a row that fails does not hide the others.
    const { rows } = applyCsvMapping([row], rowMapping, currency);
    const [read] = rows;
    staged.push(
      read === undefined
        ? stageUnreadableRow(row, mapping, line)
        : { line, rawDate: null, draft: draftOfRow(read, currency) },
    );
  });
  return staged;
}

/** A row of a file as the review shows it: the three texts, and what the user can choose besides. */
export interface TypedStagedRow extends StagedRow {
  details: RowDetails;
  /** How the type was found; null for a row the file could not give as a movement. */
  guess: TypeGuess | null;
}

function signOfAmount(text: string, currency: string): number {
  try {
    return parseAmount(text, currency);
  } catch (error) {
    if (error instanceof MoneyParseError) return -1;
    throw error;
  }
}

/**
 * Rows read without a type guess (an OFX statement, a CSV read with a mapping
 * the user fixed by hand): the sign of the amount decides, as it did before the
 * type could be chosen. A row whose amount cannot be read is taken for an expense.
 */
export function typeRowsBySign(
  staged: readonly StagedRow[],
  currency: string,
): TypedStagedRow[] {
  return staged.map((row) => ({
    ...row,
    guess: null,
    details: detailsFromSign(signOfAmount(row.draft.amount, currency)),
  }));
}

export interface StagedCategory {
  id: number;
  name: string;
  archived: boolean;
}

export interface StagedMovementFile {
  reading: MovementFileReading;
  /** Readable and unreadable rows together, in file order. */
  rows: TypedStagedRow[];
}

// The user fixes the row and its type with it: nothing is known of the amount.
const UNREADABLE_ROW_DETAILS = detailsFromSign(-1);

// Without a sign in the file, an expense and savings leave the account and an
// income enters it: only a sign written in the file can tell savings coming back.
function signedAmount(row: MovementRow, isFileSigned: boolean): number {
  if (isFileSigned) return row.amount;
  return row.type.type === "income" ? Math.abs(row.amount) : -Math.abs(row.amount);
}

function stageReadRow(
  row: MovementRow,
  isFileSigned: boolean,
  currency: string,
  categoryIds: ReadonlyMap<string, number>,
): TypedStagedRow {
  const amount = signedAmount(row, isFileSigned);
  const { type } = row.type;
  return {
    line: row.line,
    rawDate: null,
    draft: draftOfRow(
      { date: row.date, label: row.label, amount, externalId: null },
      currency,
    ),
    guess: row.type,
    details: {
      type,
      // Savings are transfers, which have no category.
      categoryId:
        type === "savings" || row.category === null
          ? null
          : (categoryIds.get(row.category.toLowerCase()) ?? null),
      paymentMode: row.paymentMode,
      description: row.description,
      savingsAccountId: null,
    },
  };
}

/**
 * A movement file as typed drafts to review. Amounts are signed by type when
 * the file carries no sign, a category is found by its name without case, and
 * a row the file cannot give as a movement is kept with what the file says.
 */
export function stageMovementFile(
  text: string,
  options: MovementFileOptions,
  categories: readonly StagedCategory[],
): StagedMovementFile {
  const reading = readMovementFile(text, options);
  const { mapping, yearApplied } = reading.analysis;
  const categoryIds = new Map(
    categories
      .filter((category) => !category.archived)
      .map((category) => [category.name.toLowerCase(), category.id]),
  );
  const isFileSigned =
    mapping !== null &&
    amountsCarrySign(
      mapping.amount.kind,
      reading.rows.map((row) => row.amount),
    );
  const rows = reading.rows.map((row) =>
    stageReadRow(row, isFileSigned, options.currency, categoryIds),
  );

  const file = parseCsvFile(text, options.delimiter);
  if (mapping !== null && "table" in file) {
    for (const issue of reading.issues) {
      if (issue.kind !== "rowUnreadable") continue;
      const cells = file.table[issue.line - 1] ?? [];
      const dated = cells.map((cell, column) =>
        column === mapping.dateColumn && yearApplied !== null
          ? completeDateYear(cell, yearApplied)
          : cell,
      );
      rows.push({
        ...stageUnreadableRow(dated, mapping, issue.line),
        guess: null,
        details: UNREADABLE_ROW_DETAILS,
      });
    }
  }
  return { reading, rows: rows.sort((a, b) => a.line - b.line) };
}
