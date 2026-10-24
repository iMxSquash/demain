/**
 * Balance assertions: a real balance recorded for an account at a date, and
 * the unexplained gap with the computed balance. Pure functions: no database,
 * no clock. See DOMAIN, entity Balance assertion.
 */

import { isCalendarDate } from "./account";
import { messageRef, type MessageRef } from "./message";

export interface AssertedAccount {
  id: number;
  /** Signed integer in minor units. */
  openingBalance: number;
}

export interface AssertionMovement {
  accountId: number;
  /** Calendar date, YYYY-MM-DD. */
  date: string;
  /** Signed integer in minor units. */
  amount: number;
}

export interface AssertionPoint {
  /** Calendar date, YYYY-MM-DD, end of day. */
  date: string;
  /** Real balance shown by the bank, in minor units. */
  amount: number;
}

export interface UnexplainedGap {
  computedBalance: number;
  /** Computed balance minus asserted amount: positive when Demain holds more than the bank. */
  gap: number;
}

export function computeUnexplainedGap(
  account: AssertedAccount,
  movements: readonly AssertionMovement[],
  assertion: AssertionPoint,
): UnexplainedGap {
  // "YYYY-MM-DD" strings sort chronologically, and the asserted day is included.
  const computedBalance = movements
    .filter(
      (movement) =>
        movement.accountId === account.id && movement.date <= assertion.date,
    )
    .reduce((total, movement) => total + movement.amount, account.openingBalance);
  return { computedBalance, gap: computedBalance - assertion.amount };
}

export interface BalanceAssertionInput {
  accountId: number;
  /** Calendar date, YYYY-MM-DD. */
  date: string;
  /** Signed integer in minor units. */
  amount: number;
  note?: string | null;
}

export interface ValidBalanceAssertionInput extends BalanceAssertionInput {
  note: string | null;
}

export type BalanceAssertionField = "date" | "amount";

export class BalanceAssertionValidationError extends Error {
  constructor(
    readonly field: BalanceAssertionField,
    /** English text for logs and tests: users read the translation of `ref`. */
    message: string,
    readonly ref: MessageRef,
  ) {
    super(message);
    this.name = "BalanceAssertionValidationError";
  }
}

export function validateBalanceAssertionInput(
  input: BalanceAssertionInput,
  account: { openingDate: string },
): ValidBalanceAssertionInput {
  if (!isCalendarDate(input.date)) {
    throw new BalanceAssertionValidationError(
      "date",
      `Invalid date "${input.date}", expected YYYY-MM-DD`,
      messageRef("balanceAssertionDateInvalid", { date: input.date }),
    );
  }
  if (input.date < account.openingDate) {
    throw new BalanceAssertionValidationError(
      "date",
      `The date cannot be before the opening of the account (${account.openingDate})`,
      messageRef("balanceAssertionBeforeOpening", {
        openingDate: account.openingDate,
      }),
    );
  }
  if (!Number.isSafeInteger(input.amount)) {
    throw new BalanceAssertionValidationError(
      "amount",
      "The balance must be an integer in minor units",
      messageRef("balanceAssertionAmountInvalid"),
    );
  }
  const note = input.note?.trim() ?? "";
  return { ...input, note: note === "" ? null : note };
}
