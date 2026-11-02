/**
 * Rows of a statement as drafts to review before anything is recorded. Pure
 * functions: no database, no clock. A row the file cannot give as a movement
 * is kept with what the file says, so that the user fixes it instead of
 * losing it.
 */

import { applyCsvMapping, parseDate, type CsvMapping } from "./import-csv";
import { draftOfRow, type ImportDraft } from "./import-draft";

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
