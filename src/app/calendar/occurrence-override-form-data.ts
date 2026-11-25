import { isCalendarDate } from "../../domain/account";
import { parseWholeNumber } from "../../domain/amount-syntax";
import { messageRef, type MessageRef, type Translate } from "../../domain/message";
import type { OccurrenceOverrideInput, PlannedItemKind } from "../../domain/planned-item";
import { readAmount, readText, signedAmountOf } from "../planned/planned-item-form-data";

/** The values of the submit buttons of the occurrence form: a skip ignores the fields. */
export const SAVE_INTENT = "save";
export const SKIP_INTENT = "skip";

/** The occurrence a form acts on: the item and the date its schedule gave the occurrence. */
export interface OccurrenceTarget {
  itemId: number;
  nominalDate: string;
}

export interface OccurrenceOverrideFormValues {
  /** Blank keeps the computed date. */
  overrideDate: string;
  /** Unsigned, in exact syntax: the kind of the item decides the direction. Blank keeps the computed amount. */
  overrideAmount: string;
}

export type OccurrenceOverrideFormField = keyof OccurrenceOverrideFormValues;

export interface OccurrenceOverrideFormState {
  field?: OccurrenceOverrideFormField;
  message: string;
  /** What the user typed: React resets the form after an action, so it is sent back. */
  values: OccurrenceOverrideFormValues;
}

/** What the server read about the item: the sign and the minor units never come from the form. */
interface OccurrenceOverrideFormContext extends OccurrenceTarget {
  kind: PlannedItemKind;
  currency: string;
}

type ParsedOccurrenceTarget = { ok: true; target: OccurrenceTarget } | { ok: false; ref: MessageRef };

type ParsedOccurrenceOverrideForm =
  | { ok: true; input: OccurrenceOverrideInput }
  | { ok: false; error: OccurrenceOverrideFormState };

/**
 * Reads the hidden fields that name the occurrence. They come from the browser, so they are checked
 * like any other input; the ledger then checks that the schedule produces this occurrence.
 */
export function readOccurrenceTarget(formData: FormData): ParsedOccurrenceTarget {
  const itemId = parseWholeNumber(readText(formData, "itemId"));
  if (itemId === null || itemId < 1 || !Number.isSafeInteger(itemId)) {
    return { ok: false, ref: messageRef("plannedItemGone") };
  }
  const nominalDate = readText(formData, "nominalDate");
  if (!isCalendarDate(nominalDate)) {
    return { ok: false, ref: messageRef("plannedItemDateInvalid", { date: nominalDate }) };
  }
  return { ok: true, target: { itemId, nominalDate } };
}

export function readSubmittedOverride(formData: FormData): OccurrenceOverrideFormValues {
  return {
    overrideDate: readText(formData, "overrideDate"),
    overrideAmount: readText(formData, "overrideAmount"),
  };
}

/**
 * Converts the occurrence form to a skip or a change, from the values read by
 * `readSubmittedOverride`. A blank field keeps what the schedule computes; a zero amount is passed
 * on, for the domain to refuse. The amount never goes through a float.
 */
export function parseOccurrenceOverrideForm(
  formData: FormData,
  values: OccurrenceOverrideFormValues,
  context: OccurrenceOverrideFormContext,
  translate: Translate,
): ParsedOccurrenceOverrideForm {
  const fail = (ref: MessageRef, field?: OccurrenceOverrideFormField) => ({
    ok: false as const,
    error: { ...(field === undefined ? {} : { field }), message: translate(ref), values },
  });
  const { nominalDate } = context;

  const intent = readText(formData, "intent");
  if (intent === SKIP_INTENT) {
    return { ok: true, input: { nominalDate, status: "cancelled", overrideDate: null, overrideAmount: null } };
  }
  if (intent !== SAVE_INTENT) return fail(messageRef("nothingSaved"));

  const dateText = values.overrideDate.trim();
  if (dateText !== "" && !isCalendarDate(dateText)) {
    return fail(messageRef("plannedItemDateInvalid", { date: dateText }), "overrideDate");
  }

  let overrideAmount: number | null = null;
  if (values.overrideAmount.trim() !== "") {
    const amount = readAmount(values.overrideAmount, context.currency);
    if ("ref" in amount) return fail(amount.ref, "overrideAmount");
    overrideAmount = signedAmountOf(context.kind, amount.value);
  }

  return {
    ok: true,
    input: {
      nominalDate,
      status: "modified",
      overrideDate: dateText === "" ? null : dateText,
      overrideAmount,
    },
  };
}
