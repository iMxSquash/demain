/**
 * The exact syntax of a typed amount and of a currency code, applied by the browser (while
 * typing and on leaving a field) and by the server schemas: one rule, two places.
 * Pure and free of any browser or server API. See DESIGN section 9, "Exact syntax".
 */

import { messageRef, type MessageRef } from "./message";
import { MoneyParseError, parseAmount, type DecimalMark } from "./money";

// Space, no-break space and narrow no-break space: what a pasted amount may carry.
const AMOUNT_SPACES = /[   ]/g;
const AMOUNT_DRAFT = /^\d*[.,]?\d*$/;
const AMOUNT_SHAPE = /^\d+(?:[.,]\d+)?$/;
const AMOUNT_TRAILING_SEPARATOR = /^\d+[.,]$/;
const CURRENCY_CODE = /^[A-Za-z]{3}$/;

export type AmountSyntaxCheck = { ok: true } | { ok: false; ref: MessageRef };

/** Removes the spaces of a pasted value ("1 143,88" becomes "1143,88"). */
export function stripAmountSpaces(text: string): string {
  return text.replace(AMOUNT_SPACES, "");
}

/**
 * Whether `text` can still become a valid amount by typing more: digits and at most one
 * comma or point. Incomplete values ("12,") pass, so that "12,5" can be typed.
 */
export function isAmountDraft(text: string): boolean {
  return AMOUNT_DRAFT.test(text);
}

/**
 * The complete syntax: digits, then at most one comma or point and the digits after it.
 * An empty value passes, since "required" is not a syntax matter.
 */
export function checkAmountSyntax(text: string): AmountSyntaxCheck {
  if (text === "" || AMOUNT_SHAPE.test(text)) return { ok: true };
  if (AMOUNT_TRAILING_SEPARATOR.test(text)) {
    return { ok: false, ref: messageRef("amountMissingDecimals", { text }) };
  }
  return { ok: false, ref: messageRef("amountSyntax", { text }) };
}

function decimalMarkOf(text: string): DecimalMark | undefined {
  if (text.includes(",")) return ",";
  return text.includes(".") ? "." : undefined;
}

/**
 * Reads an amount typed without a sign, a symbol or a grouping separator, to integer minor
 * units. The one separator is the decimal mark ("1,234" is 1.234, never 1234), and
 * `parseAmount` does the exact reading: no floating-point number is involved.
 * Throws `MoneyParseError`.
 */
export function parseUnsignedAmount(text: string, currency: string): number {
  const trimmed = text.trim();
  const check = checkAmountSyntax(trimmed);
  if (!check.ok) {
    throw new MoneyParseError(`Invalid amount "${trimmed}": digits and one separator only`, check.ref);
  }
  return parseAmount(trimmed, currency, decimalMarkOf(trimmed));
}

export function normalizeCurrencyCode(text: string): string {
  return text.trim().toUpperCase();
}

/** Exactly three letters, whatever their case. */
export function isCurrencyCode(text: string): boolean {
  return CURRENCY_CODE.test(text);
}

export const BALANCE_SIDES = ["credit", "debit"] as const;
export type BalanceSide = (typeof BALANCE_SIDES)[number];

/** A missing side means credit: the form posts it, but a script may not. */
export function readBalanceSide(text: string): BalanceSide | null {
  if (text === "") return "credit";
  return BALANCE_SIDES.find((side) => side === text) ?? null;
}

/** The server turns Debit into a negative amount. `0 - x` keeps a zero debit at +0. */
export function applyBalanceSide(amount: number, side: BalanceSide): number {
  return side === "debit" ? 0 - amount : amount;
}

/** The unsigned amount and the side that a stored balance is shown with. */
export function splitBalanceSide(minorUnits: number): { magnitude: number; side: BalanceSide } {
  return minorUnits < 0
    ? { magnitude: 0 - minorUnits, side: "debit" }
    : { magnitude: minorUnits, side: "credit" };
}
