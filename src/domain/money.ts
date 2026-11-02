/**
 * Money core: amounts are integers in the currency's minor unit (cents for EUR).
 * Pure functions, no floating-point step anywhere. See DOMAIN invariant 1 and ADR-007.
 */

import { messageRef, type MessageRef } from "./message";

const formatters = new Map<string, Intl.NumberFormat>();

// Building an Intl.NumberFormat is far more expensive than using it, and imports
// format or parse thousands of amounts with the same few currencies.
function getCurrencyFormatter(locale: string, currency: string): Intl.NumberFormat {
  const key = `${locale}|${currency}`;
  let formatter = formatters.get(key);
  if (formatter === undefined) {
    formatter = new Intl.NumberFormat(locale, { style: "currency", currency });
    formatters.set(key, formatter);
  }
  return formatter;
}

/**
 * Divides two integers and rounds to the nearest integer, ties away from zero.
 * This is the single rounding step for averages, percentages and interest.
 */
export function divideRound(numerator: number, denominator: number): number {
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator)) {
    throw new RangeError(
      `divideRound expects safe integers, got ${numerator} and ${denominator}`,
    );
  }
  if (denominator === 0) {
    throw new RangeError("divideRound cannot divide by zero");
  }

  const remainder = numerator % denominator;
  // The difference is a multiple of the denominator, so this division is exact.
  const truncated = (numerator - remainder) / denominator;
  const isNegative = numerator < 0 !== denominator < 0;
  const absRemainder = Math.abs(remainder);
  const absDenominator = Math.abs(denominator);
  // Compares against the complement rather than doubling, which could leave the safe range.
  const isAtLeastHalf = absRemainder >= absDenominator - absRemainder;
  const rounded = isAtLeastHalf ? truncated + (isNegative ? -1 : 1) : truncated;

  // Normalizes negative zero, produced by a zero numerator over a negative denominator.
  return rounded === 0 ? 0 : rounded;
}

export function currencyDecimals(currency: string): number {
  // Intl carries the ISO 4217 minor units, which avoids maintaining our own table.
  const { maximumFractionDigits } = getCurrencyFormatter(
    "en",
    currency,
  ).resolvedOptions();
  if (maximumFractionDigits === undefined) {
    throw new RangeError(`No minor unit known for currency ${currency}`);
  }
  return maximumFractionDigits;
}

export class MoneyParseError extends Error {
  constructor(
    /** English text for logs and tests: users read the translation of `ref`. */
    message: string,
    readonly ref: MessageRef,
  ) {
    super(message);
    this.name = "MoneyParseError";
  }
}

function invalidAmount(
  text: string,
  reason: string,
  ref: MessageRef,
): MoneyParseError {
  return new MoneyParseError(`Invalid amount "${text}": ${reason}`, ref);
}

// Sign and currency token may each sit on either side of the digits ("-12 €",
// "€ -12", "-€12.50"). The body must start with a digit, so letters alone are
// never mistaken for a currency code.
const AMOUNT_PATTERN =
  /^(?<signBefore>[+\-−])?\s*(?<leadToken>\p{Sc}|[A-Za-z]{3})?\s*(?<signAfter>[+\-−])?\s*(?<body>\d[\d\s.,]*?)\s*(?<trailToken>\p{Sc}|[A-Za-z]{3})?$/u;

/** The character that separates the units from the decimals, as a file writes it. */
export type DecimalMark = "," | ".";

// Plain digits, or groups of three joined by one consistent separator.
const GROUPED_INTEGER = /^(?:\d+|\d{1,3}([.,])\d{3}(?:\1\d{3})*)$/;

// With the decimal mark known, the other mark is the only group separator allowed.
const GROUPED_INTEGER_BY_MARK: Record<DecimalMark, RegExp> = {
  ",": /^(?:\d+|\d{1,3}(?:\.\d{3})+)$/,
  ".": /^(?:\d+|\d{1,3}(?:,\d{3})+)$/,
};

function splitSignAndBody(
  text: string,
  currency: string,
): { isNegative: boolean; body: string } {
  const groups = AMOUNT_PATTERN.exec(text.trim())?.groups;
  const body = groups?.["body"];
  if (groups === undefined || body === undefined) {
    throw invalidAmount(
      text,
      "expected digits with optional separators",
      messageRef("amountExpectedDigits", { text }),
    );
  }

  if (groups["signBefore"] !== undefined && groups["signAfter"] !== undefined) {
    throw invalidAmount(
      text,
      "more than one sign",
      messageRef("amountMoreThanOneSign", { text }),
    );
  }
  const sign = groups["signBefore"] ?? groups["signAfter"];

  if (groups["leadToken"] !== undefined && groups["trailToken"] !== undefined) {
    throw invalidAmount(
      text,
      "more than one currency symbol or code",
      messageRef("amountMoreThanOneCurrency", { text }),
    );
  }
  const token = groups["leadToken"] ?? groups["trailToken"];
  // A symbol is not checked because it is ambiguous ("$"); an ISO code must match.
  const isCode = token !== undefined && /^[A-Za-z]/.test(token);
  if (isCode && token.toUpperCase() !== currency.toUpperCase()) {
    throw invalidAmount(
      text,
      `amount is in ${token.toUpperCase()}, expected ${currency}`,
      messageRef("amountWrongCurrency", {
        text,
        found: token.toUpperCase(),
        expected: currency,
      }),
    );
  }

  return {
    isNegative: sign === "-" || sign === "−",
    body: body.replace(/\s/g, ""),
  };
}

/**
 * Splits at the decimal separator, if any. Without a known mark, the last
 * separator is the decimal one when it is the only separator of its kind or
 * when the other kind is also present ("1.143,88"); otherwise every separator
 * is a group separator. With a known mark, only its last occurrence is decimal.
 */
function splitDecimal(
  body: string,
  decimalMark: DecimalMark | undefined,
): {
  integerPart: string;
  fractionPart: string;
  hasDecimalSeparator: boolean;
} {
  const lastIndex =
    decimalMark === undefined
      ? Math.max(body.lastIndexOf("."), body.lastIndexOf(","))
      : body.lastIndexOf(decimalMark);
  const separator = body[lastIndex];
  const otherKind = separator === "." ? "," : ".";
  const isDecimal =
    separator !== undefined &&
    (decimalMark !== undefined ||
      body.indexOf(separator) === lastIndex ||
      body.includes(otherKind));

  if (!isDecimal) {
    return { integerPart: body, fractionPart: "", hasDecimalSeparator: false };
  }
  return {
    integerPart: body.slice(0, lastIndex),
    fractionPart: body.slice(lastIndex + 1),
    hasDecimalSeparator: true,
  };
}

/**
 * Parses a text amount ("1 143,88 €", "1,143.88", "-12.5") to integer minor
 * units by string handling only: no floating-point number is involved.
 * `decimalMark` is the one the whole file uses: it settles "1,234" (1234 with
 * the point, 1.234 with the comma) and rejects the other mark as a decimal one.
 */
export function parseAmount(
  text: string,
  currency: string,
  decimalMark?: DecimalMark,
): number {
  const decimals = currencyDecimals(currency);
  const { isNegative, body } = splitSignAndBody(text, currency);
  const { integerPart, fractionPart, hasDecimalSeparator } = splitDecimal(
    body,
    decimalMark,
  );
  const groupedInteger =
    decimalMark === undefined
      ? GROUPED_INTEGER
      : GROUPED_INTEGER_BY_MARK[decimalMark];

  if (!groupedInteger.test(integerPart)) {
    throw invalidAmount(
      text,
      "misplaced separator",
      messageRef("amountMisplacedSeparator", { text }),
    );
  }
  if (hasDecimalSeparator && fractionPart.length === 0) {
    throw invalidAmount(
      text,
      "missing digits after the decimal separator",
      messageRef("amountMissingDecimals", { text }),
    );
  }
  if (fractionPart.length > decimals) {
    throw invalidAmount(
      text,
      `${currency} has ${decimals} decimal digits at most`,
      messageRef("amountTooManyDecimals", { text, currency, decimals }),
    );
  }

  const digits =
    integerPart.replace(/[.,]/g, "") + fractionPart.padEnd(decimals, "0");
  const value = BigInt(digits);
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw invalidAmount(
      text,
      "amount is too large",
      messageRef("amountTooLarge", { text }),
    );
  }

  // BigInt has no negative zero, so "-0,00" comes out as a plain 0.
  return Number(isNegative ? -value : value);
}

// What tells the mark of one amount: a cell with both marks, a mark repeated,
// or a lone mark followed by other than three digits. "1,234" is no clue, as
// it is 1.234 in one convention and 1234 in the other.
function markClue(body: string): DecimalMark | null {
  const lastIndex = Math.max(body.lastIndexOf("."), body.lastIndexOf(","));
  const last = body[lastIndex];
  if (last !== "." && last !== ",") return null;

  const other = last === "." ? "," : ".";
  if (body.includes(other)) return last;
  if (body.indexOf(last) !== lastIndex) return other;
  return body.length - lastIndex - 1 === 3 ? null : last;
}

export interface DecimalMarkDetection {
  mark: DecimalMark;
  /** The cells disagree (or tie): this is the likeliest mark, to confirm. */
  isAmbiguous: boolean;
}

/**
 * The decimal mark a file uses, from its amount cells: the mark most cells
 * point to, the comma on a tie. Null when no cell tells (only whole amounts,
 * or "1,234" cells). Cells that are not amounts are ignored.
 */
export function detectDecimalMark(
  texts: readonly string[],
): DecimalMarkDetection | null {
  const votes = { ",": 0, ".": 0 };
  for (const text of texts) {
    const body = AMOUNT_PATTERN.exec(text.trim())?.groups?.["body"];
    const clue = body === undefined ? null : markClue(body.replace(/\s/g, ""));
    if (clue !== null) votes[clue] += 1;
  }

  if (votes[","] === 0 && votes["."] === 0) return null;
  return {
    mark: votes["."] > votes[","] ? "." : ",",
    isAmbiguous: votes[","] > 0 && votes["."] > 0,
  };
}

/**
 * Formats integer minor units for display or export. The amount is handed to
 * Intl as an exact decimal string, so no division by a power of ten happens.
 */
export function formatAmount(
  minorUnits: number,
  currency: string,
  locale: string,
): string {
  if (!Number.isSafeInteger(minorUnits)) {
    throw new RangeError(`formatAmount expects a safe integer, got ${minorUnits}`);
  }

  // "114388E-2" is the exact decimal 1143.88: the exponent form lets Intl place
  // the decimal point instead of us dividing or slicing digits.
  const exactDecimal = `${minorUnits}E-${currencyDecimals(currency)}` as `${number}`;

  return getCurrencyFormatter(locale, currency).format(exactDecimal);
}

/**
 * Writes integer minor units as a plain decimal string ("-1143.88", "1234" for
 * JPY) meant to pre-fill an input. Unlike `formatAmount` it has no symbol and no
 * grouping, so `parseAmount` reads it back unchanged in every currency.
 */
export function formatEditableAmount(minorUnits: number, currency: string): string {
  if (!Number.isSafeInteger(minorUnits)) {
    throw new RangeError(
      `formatEditableAmount expects a safe integer, got ${minorUnits}`,
    );
  }

  const decimals = currencyDecimals(currency);
  const sign = minorUnits < 0 ? "-" : "";
  const digits = String(Math.abs(minorUnits)).padStart(decimals + 1, "0");
  if (decimals === 0) return `${sign}${digits}`;

  const split = digits.length - decimals;
  return `${sign}${digits.slice(0, split)}.${digits.slice(split)}`;
}
