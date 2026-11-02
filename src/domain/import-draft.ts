/**
 * A movement of an import as the user sees and edits it: three texts and the
 * bank identifier. Pure functions: no database, no clock. The same reading
 * runs in the browser, to show what is wrong, and on the server, which trusts
 * nothing it receives.
 */

import { isCalendarDate } from "./account";
import type { MovementType } from "./import-columns";
import type { ImportedRow } from "./import-row";
import { formatEditableAmount, MoneyParseError, parseAmount } from "./money";
import type { PaymentMode } from "./transaction";

export interface ImportDraft {
  /** YYYY-MM-DD, the value of a date input; empty when the file's date could not be read. */
  date: string;
  label: string;
  /** Text as typed: read by `parseAmount`, never through a float. */
  amount: string;
  /** Carried over from the file, never edited: it keeps the duplicate detection exact. */
  externalId: string | null;
}

/** What the user chose for a row besides its three texts. */
export interface RowDetails {
  type: MovementType;
  categoryId: number | null;
  paymentMode: PaymentMode | null;
  description: string | null;
  /** The savings account of a savings row; unused for the other types. */
  savingsAccountId: number | null;
}

/** A draft and, when the user went through the details, what was chosen for it. */
export type ReviewedDraft = ImportDraft & { details?: RowDetails };

export type DraftProblem =
  "dateInvalid" | "labelRequired" | "amountInvalid" | "amountZero";

export type DetailsProblem = "typeSignMismatch" | "savingsAccountRequired";

/** Everything that can still be wrong with a reviewed row. */
export type RowProblem = DraftProblem | DetailsProblem;

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

/** The type a row gets when the user chose none: the sign of the amount decides. */
export function detailsFromSign(amount: number): RowDetails {
  return {
    type: amount < 0 ? "expense" : "income",
    categoryId: null,
    paymentMode: null,
    description: null,
    savingsAccountId: null,
  };
}

/** A row that names no savings account takes the default one, which may itself be absent. */
export function withDefaultSavingsAccount(
  details: RowDetails,
  defaultSavingsAccountId: number | null | undefined,
): RowDetails {
  return {
    ...details,
    savingsAccountId: details.savingsAccountId ?? defaultSavingsAccountId ?? null,
  };
}

/**
 * Whether the details fit the amount: an expense leaves the account and an
 * income enters it, whereas savings go both ways (a deposit, a withdrawal).
 */
export function checkRowDetails(
  details: RowDetails,
  amount: number,
): DetailsProblem | null {
  if (details.type === "savings") {
    return details.savingsAccountId === null ? "savingsAccountRequired" : null;
  }
  return (details.type === "expense") === amount < 0 ? null : "typeSignMismatch";
}
