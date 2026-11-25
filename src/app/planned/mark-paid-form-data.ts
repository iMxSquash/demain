import { isCalendarDate } from "../../domain/account";
import { messageRef, type MessageRef, type Translate } from "../../domain/message";
import type { SurplusChoice } from "../transactions/transaction-form-data";
import { readAmount, readText } from "./planned-item-form-data";

/** What the "To pay" card and the one-click buttons post besides the occurrence. */
export interface MarkPaidFormValues {
  /** YYYY-MM-DD. */
  date: string;
  /** Unsigned, in exact syntax: the kind of the item gives the direction. */
  amount: string;
}

export type MarkPaidFormField = keyof MarkPaidFormValues | "surplusAccountId";

/** A planned transfer above the ceiling of its destination: what the surplus step shows. */
export interface MarkPaidSurplusStep {
  choice: SurplusChoice;
  sourceName: string;
  destinationName: string;
  /** The accounts that can take the surplus, in display order. */
  targets: { id: number; name: string }[];
}

export type MarkPaidFormState =
  | {
      status: "error";
      field?: MarkPaidFormField;
      message: string;
      /** What the user typed: React resets the form after an action, so it is sent back. */
      values: MarkPaidFormValues;
    }
  | { status: "surplus"; step: MarkPaidSurplusStep; values: MarkPaidFormValues }
  /** Cancel on the surplus step: nothing was recorded, the button comes back. */
  | { status: "cancelled"; values: MarkPaidFormValues };

type ParsedMarkPaidForm =
  | { ok: true; input: { date: string; amount: number } }
  | { ok: false; error: MarkPaidFormState };

export function readSubmittedMarkPaid(formData: FormData): MarkPaidFormValues {
  return { date: readText(formData, "date"), amount: readText(formData, "amount") };
}

/**
 * Converts the date and the unsigned amount of a "Mark as paid" form. The minor units come from the
 * currency of the account, read on the server; the amount never goes through a float. A zero amount
 * is passed on, for the domain to refuse.
 */
export function parseMarkPaidForm(
  values: MarkPaidFormValues,
  currency: string,
  translate: Translate,
): ParsedMarkPaidForm {
  const fail = (ref: MessageRef, field: MarkPaidFormField) => ({
    ok: false as const,
    error: { status: "error" as const, field, message: translate(ref), values },
  });
  const date = values.date.trim();
  if (!isCalendarDate(date)) return fail(messageRef("plannedItemDateInvalid", { date }), "date");
  const amount = readAmount(values.amount, currency);
  if ("ref" in amount) return fail(amount.ref, "amount");
  return { ok: true, input: { date, amount: amount.value } };
}
