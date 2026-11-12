/**
 * Compact amounts for the vertical axis of a chart ("€12K", "12 k €"). Like
 * `formatAmount`, the minor units reach Intl as an exact decimal string, so no
 * division by a power of ten happens.
 */

import { currencyDecimals } from "../../../src/domain/money";

const formatters = new Map<string, Intl.NumberFormat>();

function getCompactFormatter(locale: string, currency: string): Intl.NumberFormat {
  const key = `${locale}|${currency}`;
  let formatter = formatters.get(key);
  if (formatter === undefined) {
    formatter = new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      notation: "compact",
      maximumFractionDigits: 1,
    });
    formatters.set(key, formatter);
  }
  return formatter;
}

export function formatAxisAmount(
  minorUnits: number,
  currency: string,
  locale: string,
): string {
  if (!Number.isSafeInteger(minorUnits)) {
    throw new RangeError(`formatAxisAmount expects a safe integer, got ${minorUnits}`);
  }
  const exactDecimal = `${minorUnits}E-${currencyDecimals(currency)}` as `${number}`;
  return getCompactFormatter(locale, currency).format(exactDecimal);
}
