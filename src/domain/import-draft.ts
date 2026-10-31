/**
 * A movement of an import as the user sees and edits it: three texts and the
 * bank identifier. Pure functions: no database, no clock. The same reading
 * runs in the browser, to show what is wrong, and on the server, which trusts
 * nothing it receives.
 */

import { isCalendarDate } from "./account";
import type { ImportedRow } from "./import-row";
import { formatEditableAmount, MoneyParseError, parseAmount } from "./money";

export interface ImportDraft {
  /** YYYY-MM-DD, the value of a date input; empty when the file's date could not be read. */
  date: string;
  label: string;
  /** Text as typed: read by `parseAmount`, never through a float. */
  amount: string;
  /** Carried over from the file, never edited: it keeps the duplicate detection exact. */
  externalId: string | null;
}

export type DraftProblem =
  "dateInvalid" | "labelRequired" | "amountInvalid" | "amountZero";

export type DraftReading =
  { ok: true; row: ImportedRow } | { ok: false; problem: DraftProblem };

export function readImportDraft(
  draft: ImportDraft,
  currency: string,
): DraftReading {
  if (!isCalendarDate(draft.date)) return { ok: false, problem: "dateInvalid" };
  const label = draft.label.trim();
  if (label === "") return { ok: false, problem: "labelRequired" };

  let amount: number;
  try {
    amount = parseAmount(draft.amount, currency);
  } catch (error) {
    if (error instanceof MoneyParseError) {
      return { ok: false, problem: "amountInvalid" };
    }
    throw error;
  }
  if (amount === 0) return { ok: false, problem: "amountZero" };

  return {
    ok: true,
    row: { date: draft.date, label, amount, externalId: draft.externalId },
  };
}

export function draftOfRow(row: ImportedRow, currency: string): ImportDraft {
  return {
    date: row.date,
    label: row.label,
    amount: formatEditableAmount(row.amount, currency),
    externalId: row.externalId,
  };
}
