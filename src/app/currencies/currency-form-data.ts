import { isCurrencyCode, normalizeCurrencyCode } from "../../domain/amount-syntax";
import type { ExchangeRateField } from "../../domain/exchange-rate";
import { messageRef, type MessageRef } from "../../domain/message";

export interface RateFormValues {
  date: string;
  base: string;
  quote: string;
  rate: string;
}

export interface RateFormState {
  field?: ExchangeRateField;
  message: string;
  /** What the user typed: React resets the form after an action, so it is sent back. */
  values: RateFormValues;
}

export interface ReferenceCurrencyFormState {
  message: string;
  value: string;
}

function readText(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export function readRateValues(formData: FormData): RateFormValues {
  return {
    date: readText(formData, "date"),
    base: readText(formData, "base").toUpperCase(),
    quote: readText(formData, "quote").toUpperCase(),
    rate: readText(formData, "rate"),
  };
}

export type CurrencyCodeReading =
  | { ok: true; code: string }
  | { ok: false; value: string; ref: MessageRef };

/** Exactly three letters, uppercased. `value` is what to show back when it is refused. */
export function parseCurrencyCode(formData: FormData): CurrencyCodeReading {
  const value = normalizeCurrencyCode(readText(formData, "currency"));
  return isCurrencyCode(value)
    ? { ok: true, code: value }
    : { ok: false, value, ref: messageRef("currencyCodeSyntax", { text: value }) };
}
