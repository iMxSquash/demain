/**
 * The real balance of an account at the end of an imported file: the date it
 * is read at, and the text the user types. Pure functions: no database, no
 * clock. The gap itself is `computeUnexplainedGap` (see balance-assertion).
 */

import { isCalendarDate } from "./account";
import { applyBalanceSide, containsTypedSign, type BalanceSide } from "./amount-syntax";
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

/**
 * Reads the balance typed by the user to integer minor units, refusing what it cannot read
 * exactly. The amount is typed without a sign: the side (Credit or Debit) gives it, applied
 * on the integer.
 */
export function parseRealBalance(text: string, currency: string, side: BalanceSide): number {
  const trimmed = text.trim();
  if (trimmed === "") {
    throw new RealBalanceError("The real balance is empty", messageRef("realBalanceRequired"));
  }
  if (containsTypedSign(trimmed)) {
    throw new RealBalanceError(
      `Invalid balance "${trimmed}": the side gives the sign`,
      messageRef("balanceUnsigned"),
    );
  }
  try {
    return applyBalanceSide(parseAmount(trimmed, currency), side);
  } catch (error) {
    if (error instanceof MoneyParseError) {
      throw new RealBalanceError(error.message, error.ref);
    }
    throw error;
  }
}
