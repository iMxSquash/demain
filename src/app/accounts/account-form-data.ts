import type { AccountField, AccountInput } from "../../domain/account";
import { MoneyParseError, parseAmount } from "../../domain/money";

export interface AccountFormValues {
  name: string;
  kind: string;
  currency: string;
  openingDate: string;
  openingBalance: string;
}

export interface AccountFormState {
  field?: AccountField;
  message: string;
  /** What the user typed: React resets the form after an action, so it is sent back. */
  values: AccountFormValues;
}

export type ParsedAccountForm =
  | { ok: true; input: AccountInput }
  | { ok: false; error: AccountFormState };

function readText(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

export function readSubmittedValues(formData: FormData): AccountFormValues {
  return {
    name: readText(formData, "name"),
    kind: readText(formData, "kind"),
    currency: readText(formData, "currency"),
    openingDate: readText(formData, "openingDate"),
    openingBalance: readText(formData, "openingBalance"),
  };
}

/** Converts submitted text to a typed input. The amount never goes through a float. */
export function parseAccountForm(formData: FormData): ParsedAccountForm {
  const values = readSubmittedValues(formData);
  const currency = values.currency.trim().toUpperCase();

  let openingBalance: number;
  try {
    openingBalance = parseAmount(values.openingBalance, currency);
  } catch (error) {
    // RangeError: Intl refuses a malformed currency code before any parsing.
    if (error instanceof RangeError) {
      return {
        ok: false,
        error: {
          field: "currency",
          message: `Unknown currency "${currency}"`,
          values,
        },
      };
    }
    if (error instanceof MoneyParseError) {
      return {
        ok: false,
        error: { field: "openingBalance", message: error.message, values },
      };
    }
    throw error;
  }

  return {
    ok: true,
    input: {
      name: values.name,
      kind: values.kind,
      currency,
      openingDate: values.openingDate,
      openingBalance,
    },
  };
}
