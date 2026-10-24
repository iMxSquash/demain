/**
 * Rows read from a bank export, whatever the format. Pure functions: no
 * database, no clock. See DOMAIN, entities Transaction and Import batch.
 */

import { messageRef, type FeedbackKey, type MessageRef } from "./message";
import { MoneyParseError, parseAmount } from "./money";

/** One movement as the bank reports it, before it becomes a transaction. */
export interface ImportedRow {
  /** Booking date, YYYY-MM-DD. */
  date: string;
  /** Signed integer in minor units: negative leaves the account. */
  amount: number;
  /** Raw label, trimmed, never interpreted as markup. */
  label: string;
  /** Identifier given by the bank (OFX FITID), null when the format has none. */
  externalId: string | null;
}

export interface FingerprintedRow extends ImportedRow {
  /** What identifies the movement: the bank identifier when there is one, else the content key. */
  fingerprint: string;
  /** Built from date, amount and label only, so that a file without identifiers still matches one with them. */
  contentKey: string;
}

export class ImportParseError extends Error {
  constructor(
    /** English text for logs and tests: users read the translation of `ref`. */
    message: string,
    readonly ref: MessageRef,
    /** 1-based line of the file the problem comes from, when there is one. */
    readonly line: number | null = null,
  ) {
    super(message);
    this.name = "ImportParseError";
  }
}

export function importParseError(
  message: string,
  key: FeedbackKey,
  values?: MessageRef["values"],
  line: number | null = null,
): ImportParseError {
  return new ImportParseError(message, messageRef(key, values), line);
}

/** Reads a text amount for a row: a bad or zero amount rejects the row. */
export function parseRowAmount(
  text: string,
  currency: string,
  line: number,
): number {
  let amount: number;
  try {
    amount = parseAmount(text, currency);
  } catch (error) {
    if (error instanceof MoneyParseError) {
      throw new ImportParseError(error.message, error.ref, line);
    }
    throw error;
  }
  if (amount === 0) {
    throw importParseError(
      `Row ${line} has a zero amount`,
      "importAmountZero",
      undefined,
      line,
    );
  }
  return amount;
}

export function requireRowLabel(label: string, line: number): string {
  if (label === "") {
    throw importParseError(
      `Row ${line} has no label`,
      "importLabelRequired",
      undefined,
      line,
    );
  }
  return label;
}

function normalizeLabel(label: string): string {
  return label.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Gives each row the values that detect it when the same movement is imported
 * again. A bank identifier is the most reliable fingerprint; without one the
 * fingerprint is the content key, built from date, amount and label and
 * numbered within the file so that two genuine identical movements (two coffees
 * the same day) both survive.
 */
export function fingerprintRows(
  rows: readonly ImportedRow[],
): FingerprintedRow[] {
  const seen = new Map<string, number>();
  return rows.map((row) => {
    const base = `${row.date}|${row.amount}|${normalizeLabel(row.label)}`;
    const occurrence = seen.get(base) ?? 0;
    seen.set(base, occurrence + 1);
    const contentKey = `row:${base}|${occurrence}`;
    return {
      ...row,
      fingerprint:
        row.externalId === null ? contentKey : `id:${row.externalId}`,
      contentKey,
    };
  });
}
