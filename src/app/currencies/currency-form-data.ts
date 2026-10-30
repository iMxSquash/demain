import type { ExchangeRateField } from "../../domain/exchange-rate";

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

export function readCurrency(formData: FormData): string {
  return readText(formData, "currency").toUpperCase();
}
