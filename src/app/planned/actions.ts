"use server";

import { redirect } from "next/navigation";

import { messageRef, type MessageRef, type Translate } from "../../domain/message";
import { PlannedItemValidationError, type PlannedItemField } from "../../domain/planned-item";
import { getAccount, listAccounts } from "../../ledger/accounts";
import {
  addPlannedItemVersion,
  cancelPlannedItem,
  createPlannedItem,
  getPlannedItem,
  PlannedItemNotFoundError,
  setPlannedItemEnd,
  updatePlannedItemDetails,
} from "../../ledger/planned-items";
import { withDatabase } from "../../storage/with-database";
import { requireSession } from "../auth/session";
import { refreshData } from "../data-cache";
import { flashError, flashSuccess, runWithNotice } from "../feedback/flash";
import { getTranslator } from "../translator";
import type { CurrencyByAccount } from "../transactions/transaction-form-data";
import {
  formFieldOf,
  parsePlannedItemDetailsForm,
  parsePlannedItemEndDateForm,
  parsePlannedItemForm,
  parsePlannedItemVersionForm,
  readSubmittedDetails,
  readSubmittedEndDate,
  readSubmittedValues,
  readSubmittedVersion,
  type PlannedItemDetailsFormState,
  type PlannedItemEndDateFormState,
  type PlannedItemFormState,
  type PlannedItemVersionFormState,
} from "./planned-item-form-data";

const PLANNED_PATH = "/planned";
const DETAILS_FIELDS = [
  "name",
  "categoryId",
  "provisionLabelFilter",
  "matchWindowDays",
  "matchTolerancePercent",
] as const;

function describeFailure(error: unknown): MessageRef {
  if (error instanceof PlannedItemNotFoundError) return messageRef("plannedItemGone");
  // Unexpected failures are logged with their detail, the user sees a generic message.
  console.error("Planned item action failed", error);
  return messageRef("plannedItemNotSaved");
}

function loadCurrencies(): CurrencyByAccount {
  return withDatabase(
    (db) => new Map(listAccounts(db).map((account) => [account.id, account.currency])),
  );
}

/**
 * A refusal of the domain is shown on its field, when the form has a control for it. A failure that
 * no field explains is told in a toast. The typed values come back with both.
 */
async function toFailureState<Field extends string, Values>(
  error: unknown,
  values: Values,
  translate: Translate,
  controlOf: (field: PlannedItemField) => Field | undefined,
): Promise<{ field?: Field; message: string; values: Values }> {
  if (error instanceof PlannedItemValidationError) {
    const field = controlOf(error.field);
    return { ...(field === undefined ? {} : { field }), message: translate(error.ref), values };
  }
  const ref = describeFailure(error);
  await flashError(ref);
  return { message: translate(ref), values };
}

// A refusal on a field the edit form has no control for is shown as a message.
const detailsControlOf = (field: PlannedItemField) =>
  DETAILS_FIELDS.find((candidate) => candidate === formFieldOf(field));

// The controls of the version form that the domain can refuse; the business day rule has no
// refusal of its own, and a refusal on another field is shown as a message.
const VERSION_FIELDS = ["effectiveFrom", "repetition", "amount", "amountMode", "averageWindow"] as const;
const versionControlOf = (field: PlannedItemField) =>
  VERSION_FIELDS.find((candidate) => candidate === field);
const endDateControlOf = (field: PlannedItemField) => (field === "endDate" ? field : undefined);

export async function createPlannedItemAction(
  _previous: PlannedItemFormState | null,
  formData: FormData,
): Promise<PlannedItemFormState | null> {
  await requireSession();
  const translate = await getTranslator();
  const parsed = parsePlannedItemForm(formData, loadCurrencies(), translate);
  if (!parsed.ok) return parsed.error;

  try {
    withDatabase((db) => createPlannedItem(db, parsed.input));
  } catch (error) {
    return await toFailureState(error, readSubmittedValues(formData), translate, formFieldOf);
  }

  refreshData();
  await flashSuccess("plannedItemCreated");
  return null;
}

export async function updatePlannedItemAction(
  id: number,
  _previous: PlannedItemDetailsFormState | null,
  formData: FormData,
): Promise<PlannedItemDetailsFormState | null> {
  await requireSession();
  const translate = await getTranslator();

  const parsed = parsePlannedItemDetailsForm(formData, translate);
  if (!parsed.ok) return parsed.error;

  try {
    // The domain refuses a label filter on an item that is not a provision.
    withDatabase((db) => updatePlannedItemDetails(db, id, parsed.details));
  } catch (error) {
    return await toFailureState(error, readSubmittedDetails(formData), translate, detailsControlOf);
  }

  refreshData();
  await flashSuccess("plannedItemUpdated");
  // redirect throws, so it stays outside the try block.
  redirect(PLANNED_PATH);
}

type VersionOutcome =
  | { rejected: PlannedItemVersionFormState }
  | { replaced: boolean; effectiveFrom: string };

export async function addPlannedItemVersionAction(
  itemId: number,
  _previous: PlannedItemVersionFormState | null,
  formData: FormData,
): Promise<PlannedItemVersionFormState | null> {
  await requireSession();
  const translate = await getTranslator();

  let outcome: VersionOutcome;
  try {
    outcome = withDatabase((db) => {
      // The kind gives the sign of the amount and the account its currency: both are read first.
      const { kind, accountId } = getPlannedItem(db, itemId);
      const { currency } = getAccount(db, accountId);
      const parsed = parsePlannedItemVersionForm(formData, { kind, currency }, translate);
      if (!parsed.ok) return { rejected: parsed.error };
      const { replaced } = addPlannedItemVersion(db, itemId, parsed.input);
      return { replaced, effectiveFrom: parsed.input.effectiveFrom };
    });
  } catch (error) {
    return await toFailureState(error, readSubmittedVersion(formData), translate, versionControlOf);
  }
  if ("rejected" in outcome) return outcome.rejected;

  refreshData();
  // Replacing a version is told, so that nobody believes a second one was added.
  if (outcome.replaced) {
    await flashSuccess("plannedItemVersionReplaced", { date: outcome.effectiveFrom });
  } else {
    await flashSuccess("plannedItemVersionSaved");
  }
  return null;
}

type EndDateOutcome = { rejected: PlannedItemEndDateFormState } | { endDate: string | null };

export async function setPlannedItemEndAction(
  itemId: number,
  _previous: PlannedItemEndDateFormState | null,
  formData: FormData,
): Promise<PlannedItemEndDateFormState | null> {
  await requireSession();
  const translate = await getTranslator();

  let outcome: EndDateOutcome;
  try {
    outcome = withDatabase((db) => {
      const parsed = parsePlannedItemEndDateForm(formData);
      if (!parsed.ok) return { rejected: parsed.error };
      setPlannedItemEnd(db, itemId, parsed.endDate);
      return { endDate: parsed.endDate };
    });
  } catch (error) {
    return await toFailureState(error, readSubmittedEndDate(formData), translate, endDateControlOf);
  }
  if ("rejected" in outcome) return outcome.rejected;

  refreshData();
  await flashSuccess(outcome.endDate === null ? "plannedItemEndDateCleared" : "plannedItemEndDateSaved");
  return null;
}

export async function cancelPlannedItemAction(itemId: number): Promise<void> {
  await requireSession();
  await runWithNotice(
    () => {
      withDatabase((db) => cancelPlannedItem(db, itemId));
    },
    { success: "plannedItemCancelled", describeFailure },
  );
  refreshData();
}
