"use server";

import type { OverrideStatus } from "../../domain/occurrences";
import type { PlannedItemField } from "../../domain/planned-item";
import { getAccount } from "../../ledger/accounts";
import {
  deleteOccurrenceOverride,
  getPlannedItem,
  saveOccurrenceOverride,
} from "../../ledger/planned-items";
import { withDatabase } from "../../storage/with-database";
import { requireSession } from "../auth/session";
import { refreshData } from "../data-cache";
import { flashSuccess } from "../feedback/flash";
import { toFailureState } from "../planned/planned-item-failure";
import { getTranslator } from "../translator";
import {
  parseOccurrenceOverrideForm,
  readOccurrenceTarget,
  readSubmittedOverride,
  type OccurrenceOverrideFormField,
  type OccurrenceOverrideFormState,
} from "./occurrence-override-form-data";

/** The restore form has no field: a refusal is a message. */
export interface OccurrenceRestoreFormState {
  message: string;
}

// The domain refuses the amount of an override on "amount", like any planned amount. A refusal on
// the nominal date (linked, cancelled item, archived account, no such occurrence) is about the
// occurrence, so it is told as a message.
function overrideControlOf(field: PlannedItemField): OccurrenceOverrideFormField | undefined {
  if (field === "overrideDate") return "overrideDate";
  if (field === "amount") return "overrideAmount";
  return undefined;
}

const noControl = () => undefined;

type SaveOutcome = { rejected: OccurrenceOverrideFormState } | { status: OverrideStatus };

/**
 * Skips, moves or changes the amount of one occurrence. The user stays on the calendar: a null state
 * tells the form that the change is saved, and a toast says so.
 */
export async function saveOccurrenceOverrideAction(
  _previous: OccurrenceOverrideFormState | null,
  formData: FormData,
): Promise<OccurrenceOverrideFormState | null> {
  await requireSession();
  const translate = await getTranslator();
  const values = readSubmittedOverride(formData);
  const read = readOccurrenceTarget(formData);
  if (!read.ok) return { message: translate(read.ref), values };
  const { target } = read;

  let outcome: SaveOutcome;
  try {
    outcome = withDatabase((db) => {
      // The kind gives the sign of the amount and the account its currency: neither comes from the form.
      const { kind, accountId } = getPlannedItem(db, target.itemId);
      const { currency } = getAccount(db, accountId);
      const parsed = parseOccurrenceOverrideForm(
        formData,
        values,
        { ...target, kind, currency },
        translate,
      );
      if (!parsed.ok) return { rejected: parsed.error };
      saveOccurrenceOverride(db, target.itemId, parsed.input);
      return { status: parsed.input.status };
    });
  } catch (error) {
    return { ...(await toFailureState(error, translate, overrideControlOf)), values };
  }
  if ("rejected" in outcome) return outcome.rejected;

  refreshData();
  await flashSuccess(
    outcome.status === "cancelled" ? "occurrenceSkipped" : "occurrenceOverrideSaved",
  );
  return null;
}

/** Gives one occurrence back the date and the amount its schedule computes. */
export async function deleteOccurrenceOverrideAction(
  _previous: OccurrenceRestoreFormState | null,
  formData: FormData,
): Promise<OccurrenceRestoreFormState | null> {
  await requireSession();
  const translate = await getTranslator();
  // A malformed date would delete nothing and still be told as restored: it is refused here.
  const read = readOccurrenceTarget(formData);
  if (!read.ok) return { message: translate(read.ref) };
  const { itemId, nominalDate } = read.target;

  try {
    withDatabase((db) => deleteOccurrenceOverride(db, itemId, nominalDate));
  } catch (error) {
    const { message } = await toFailureState(error, translate, noControl);
    return { message };
  }

  refreshData();
  await flashSuccess("occurrenceRestored");
  return null;
}
