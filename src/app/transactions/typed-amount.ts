import { parseUnsignedAmount } from "../../domain/amount-syntax";
import { formatAmount, MoneyParseError } from "../../domain/money";

/**
 * The amount typed so far, written in its currency ("€42.50"), or null while it is empty,
 * zero or not a valid amount. Text is read by string handling, never through a float.
 */
export function formatTypedAmount(text: string, currency: string, locale: string): string | null {
  try {
    const minorUnits = parseUnsignedAmount(text, currency);
    return minorUnits === 0 ? null : formatAmount(minorUnits, currency, locale);
  } catch (error) {
    if (error instanceof MoneyParseError) return null;
    throw error;
  }
}
