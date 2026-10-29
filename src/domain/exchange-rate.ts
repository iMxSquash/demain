/**
 * Exchange rates: dated, stored as scaled integers, applied with exact integer
 * arithmetic. Pure functions, no clock, database or network. See DOMAIN,
 * currency and exchange rate, and ADR-007.
 */

import { isCalendarDate, isKnownCurrency } from "./account";
import { messageRef, type MessageRef } from "./message";
import { currencyDecimals } from "./money";

const RATE_DECIMALS = 8;
/** Rates are integers counting 1/RATE_SCALE of a unit: 1.0821 is 108_210_000. */
const RATE_SCALE = 10n ** BigInt(RATE_DECIMALS);
const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

const RATE_PATTERN = /^(?<integerPart>\d+)(?:[.,](?<fractionPart>\d+))?$/;

export interface ExchangeRate {
  /** Calendar date of validity, YYYY-MM-DD. */
  date: string;
  /** 1 `base` is worth `rate / RATE_SCALE` `quote`. */
  base: string;
  quote: string;
  rate: number;
}

export class ExchangeRateParseError extends Error {
  constructor(
    /** English text for logs and tests: users read the translation of `ref`. */
    message: string,
    readonly ref: MessageRef,
  ) {
    super(message);
    this.name = "ExchangeRateParseError";
  }
}

export type ExchangeRateField = "date" | "base" | "quote" | "rate" | "currency";

export class ExchangeRateValidationError extends Error {
  constructor(
    readonly field: ExchangeRateField,
    /** English text for logs and tests: users read the translation of `ref`. */
    message: string,
    readonly ref: MessageRef,
  ) {
    super(message);
    this.name = "ExchangeRateValidationError";
  }
}

/** Throws unless `code` is an ISO 4217 currency code. */
export function assertKnownCurrency(
  code: string,
  field: ExchangeRateField,
): void {
  if (!isKnownCurrency(code)) {
    throw new ExchangeRateValidationError(
      field,
      `Unknown currency "${code}", expected an ISO 4217 code such as EUR`,
      messageRef("accountCurrencyUnknown", { currency: code }),
    );
  }
}

/**
 * Parses a typed rate ("1.0821", "1,0821") to a scaled integer by string
 * handling only: no floating-point number is involved.
 */
export function parseRate(text: string): number {
  const groups = RATE_PATTERN.exec(text.trim())?.groups;
  const integerPart = groups?.["integerPart"];
  const fractionPart = groups?.["fractionPart"] ?? "";
  const fail = (): ExchangeRateParseError =>
    new ExchangeRateParseError(
      `Invalid exchange rate "${text}"`,
      messageRef("exchangeRateInvalid", { text, decimals: RATE_DECIMALS }),
    );
  if (integerPart === undefined || fractionPart.length > RATE_DECIMALS) {
    throw fail();
  }

  const scaled = BigInt(integerPart + fractionPart.padEnd(RATE_DECIMALS, "0"));
  if (scaled === 0n || scaled > MAX_SAFE) {
    throw fail();
  }
  return Number(scaled);
}

/**
 * Formats a scaled rate for display and editing. The rate is handed to Intl as
 * an exact decimal string, and grouping is off so that `parseRate` reads it back.
 */
export function formatRate(rate: number, locale: string): string {
  if (!Number.isSafeInteger(rate)) {
    throw new RangeError(`formatRate expects a safe integer, got ${rate}`);
  }
  const exactDecimal = `${rate}E-${RATE_DECIMALS}` as `${number}`;
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: RATE_DECIMALS,
    useGrouping: false,
  }).format(exactDecimal);
}

export interface ExchangeRateInput {
  /** Calendar date of validity, YYYY-MM-DD. */
  date: string;
  base: string;
  quote: string;
  /** Typed decimal, for example "1,0821". */
  rate: string;
}

/** Checks a typed rate and converts it to its stored form. */
export function validateExchangeRateInput(
  input: ExchangeRateInput,
): ExchangeRate {
  if (!isCalendarDate(input.date)) {
    throw new ExchangeRateValidationError(
      "date",
      `Invalid date "${input.date}", expected YYYY-MM-DD`,
      messageRef("exchangeRateDateInvalid", { date: input.date }),
    );
  }
  assertKnownCurrency(input.base, "base");
  assertKnownCurrency(input.quote, "quote");
  if (input.base === input.quote) {
    throw new ExchangeRateValidationError(
      "quote",
      "A rate links two different currencies",
      messageRef("exchangeRateSameCurrency"),
    );
  }
  try {
    return { ...input, rate: parseRate(input.rate) };
  } catch (error) {
    if (error instanceof ExchangeRateParseError) {
      throw new ExchangeRateValidationError("rate", error.message, error.ref);
    }
    throw error;
  }
}

/** Divides and rounds to the nearest integer, ties away from zero. */
function divideRoundBig(numerator: bigint, denominator: bigint): bigint {
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  const absRemainder = remainder < 0n ? -remainder : remainder;
  if (absRemainder * 2n < denominator) {
    return quotient;
  }
  return numerator < 0n ? quotient - 1n : quotient + 1n;
}

/**
 * The most recent rate on or before `date` for the pair, in either direction.
 * On the same date the rate stored in the asked direction wins.
 */
function findRate(
  from: string,
  to: string,
  date: string,
  rates: readonly ExchangeRate[],
): { rate: ExchangeRate; isInverted: boolean } | null {
  let found: { rate: ExchangeRate; isInverted: boolean } | null = null;
  for (const rate of rates) {
    // ISO dates sort chronologically as plain strings.
    if (rate.date > date) {
      continue;
    }
    const isDirect = rate.base === from && rate.quote === to;
    const isInverted = rate.base === to && rate.quote === from;
    if (!isDirect && !isInverted) {
      continue;
    }
    const isBetter =
      found === null ||
      rate.date > found.rate.date ||
      (rate.date === found.rate.date && isDirect && found.isInverted);
    if (isBetter) {
      found = { rate, isInverted };
    }
  }
  return found;
}

/**
 * Converts integer minor units from one currency to another with the rate in
 * force on `date`, or null when no rate applies yet.
 */
export function convertAmount(
  minorUnits: number,
  from: string,
  to: string,
  date: string,
  rates: readonly ExchangeRate[],
): number | null {
  if (from === to) {
    return minorUnits;
  }
  const found = findRate(from, to, date, rates);
  if (found === null) {
    return null;
  }

  // Minor units of each currency differ in size: both decimals enter the ratio.
  const toUnits = 10n ** BigInt(currencyDecimals(to));
  const fromUnits = 10n ** BigInt(currencyDecimals(from));
  const rate = BigInt(found.rate.rate);
  const amount = BigInt(minorUnits);
  const converted = found.isInverted
    ? divideRoundBig(amount * RATE_SCALE * toUnits, rate * fromUnits)
    : divideRoundBig(amount * rate * toUnits, RATE_SCALE * fromUnits);
  if (converted > MAX_SAFE || converted < -MAX_SAFE) {
    throw new RangeError(
      `Converting ${minorUnits} ${from} to ${to} exceeds the safe integer range`,
    );
  }
  return Number(converted);
}

export class EcbResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EcbResponseError";
  }
}

const ECB_BASE_CURRENCY = "EUR";
const ECB_DAY_PATTERN = /<Cube\s+time=['"](\d{4}-\d{2}-\d{2})['"]/;
const ECB_RATE_PATTERN =
  /<Cube\s+currency=['"]([A-Za-z]{3})['"]\s+rate=['"]([^'"]+)['"]\s*\/>/g;

/**
 * Reads the daily reference rates of the ECB feed (`eurofxref-daily.xml`): all
 * of them are quoted against the euro on the date of the feed. Any value that
 * is not a valid rate fails the whole feed rather than being skipped.
 */
export function parseEcbRates(xml: string): ExchangeRate[] {
  const date = ECB_DAY_PATTERN.exec(xml)?.[1];
  if (date === undefined) {
    throw new EcbResponseError("The ECB feed has no dated rates");
  }
  const rates = [...xml.matchAll(ECB_RATE_PATTERN)].map(([, quote, rate]) =>
    validateExchangeRateInput({
      date,
      base: ECB_BASE_CURRENCY,
      quote: (quote ?? "").toUpperCase(),
      rate: rate ?? "",
    }),
  );
  if (rates.length === 0) {
    throw new EcbResponseError("The ECB feed has no rates");
  }
  return rates;
}
