/**
 * The real balance of an account at the end of an imported file: the date it
 * is read at, and the text the user types. Pure functions: no database, no
 * clock. The gap itself is `computeUnexplainedGap` (see balance-assertion).
 */

import { isCalendarDate } from "./account";
import { messageRef, type MessageRef } from "./message";
import { MoneyParseError, parseAmount } from "./money";

export class RealBalanceError extends Error {
  constructor(
    /** English text for logs and tests: users read the translation of `ref`. */
    message: string,
    readonly ref: MessageRef,
  ) {
    super(message);
    this.name = "RealBalanceError";
  }
}

/**
 * The date of the last movement of a file, or null when there is none. The
 * balance is read at the end of that day, not today: a file ends where its
 * last movement is.
 */
export function lastMovementDate(dates: readonly string[]): string | null {
  const valid = dates.filter(isCalendarDate);
  if (valid.length === 0) return null;
  // "YYYY-MM-DD" strings sort chronologically.
  return valid.reduce((last, date) => (date > last ? date : last));
}

/** Reads the balance typed by the user to integer minor units, refusing what it cannot read exactly. */
export function parseRealBalance(text: string, currency: string): number {
  if (text.trim() === "") {
    throw new RealBalanceError(
      "The real balance is empty",
      messageRef("realBalanceRequired"),
    );
  }
  try {
    return parseAmount(text, currency);
  } catch (error) {
    if (error instanceof MoneyParseError) {
      throw new RealBalanceError(error.message, error.ref);
    }
    throw error;
  }
}
