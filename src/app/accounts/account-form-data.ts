import type { AccountField, AccountInput } from "../../domain/account";
import { messageRef, type Translate } from "../../domain/message";
import { MoneyParseError, parseAmount } from "../../domain/money";

export interface AccountFormValues {
  name: string;
  kind: string;
  currency: string;
  openingDate: string;
  openingBalance: string;
  /** Blank means no ceiling. */
  depositCeiling: string;
  /** Account id as text, blank means no overflow account. */
  overflowAccountId: string;
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
    depositCeiling: readText(formData, "depositCeiling"),
    overflowAccountId: readText(formData, "overflowAccountId"),
  };
}

type AmountResult = { value: number } | { error: AccountFormState };

function readAmount(
  field: AccountField,
  text: string,
  currency: string,
  values: AccountFormValues,
  translate: Translate,
): AmountResult {
  try {
    return { value: parseAmount(text, currency) };
  } catch (error) {
    // RangeError: Intl refuses a malformed currency code before any parsing.
    if (error instanceof RangeError) {
      return {
        error: {
          field: "currency",
          message: translate(messageRef("accountCurrencyUnknown", { currency })),
          values,
        },
      };
    }
    if (error instanceof MoneyParseError) {
      return { error: { field, message: translate(error.ref), values } };
    }
    throw error;
  }
}

/** Converts submitted text to a typed input. Amounts never go through a float. */
export function parseAccountForm(
  formData: FormData,
  translate: Translate,
): ParsedAccountForm {
  const values = readSubmittedValues(formData);
  const currency = values.currency.trim().toUpperCase();

  const opening = readAmount(
    "openingBalance",
    values.openingBalance,
    currency,
    values,
    translate,
  );
  if ("error" in opening) return { ok: false, error: opening.error };

  let depositCeiling: number | null = null;
  if (values.depositCeiling.trim() !== "") {
    const ceiling = readAmount(
      "depositCeiling",
      values.depositCeiling,
      currency,
      values,
      translate,
    );
    if ("error" in ceiling) return { ok: false, error: ceiling.error };
    depositCeiling = ceiling.value;
  }

  let overflowAccountId: number | null = null;
  if (values.overflowAccountId.trim() !== "") {
    overflowAccountId = Number(values.overflowAccountId);
    if (!Number.isSafeInteger(overflowAccountId)) {
      return {
        ok: false,
        error: {
          field: "overflowAccountId",
          message: translate(messageRef("overflowAccountUnknown")),
          values,
        },
      };
    }
  }

  return {
    ok: true,
    input: {
      name: values.name,
      kind: values.kind,
      currency,
      openingDate: values.openingDate,
      openingBalance: opening.value,
      depositCeiling,
      overflowAccountId,
    },
  };
}
