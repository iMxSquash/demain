import type {
  BalanceAssertionField,
  BalanceAssertionInput,
} from "../../../../domain/balance-assertion";
import type { Translate } from "../../../../domain/message";
import { MoneyParseError, parseAmount } from "../../../../domain/money";

export interface BalanceAssertionFormValues {
  date: string;
  amount: string;
  note: string;
}

export interface BalanceAssertionFormState {
  field?: BalanceAssertionField;
  message: string;
  /** What the user typed: React resets the form after an action, so it is sent back. */
  values: BalanceAssertionFormValues;
}

export type ParsedBalanceAssertionForm =
  | { ok: true; input: BalanceAssertionInput }
  | { ok: false; error: BalanceAssertionFormState };

function readText(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

export function readSubmittedValues(
  formData: FormData,
): BalanceAssertionFormValues {
  return {
    date: readText(formData, "date"),
    amount: readText(formData, "amount"),
    note: readText(formData, "note"),
  };
}

/** Converts submitted text to a typed input. Amounts never go through a float. */
export function parseBalanceAssertionForm(
  formData: FormData,
  accountId: number,
  currency: string,
  translate: Translate,
): ParsedBalanceAssertionForm {
  const values = readSubmittedValues(formData);
  try {
    return {
      ok: true,
      input: {
        accountId,
        date: values.date,
        amount: parseAmount(values.amount, currency),
        note: values.note,
      },
    };
  } catch (error) {
    if (error instanceof MoneyParseError) {
      return {
        ok: false,
        error: { field: "amount", message: translate(error.ref), values },
      };
    }
    throw error;
  }
}
