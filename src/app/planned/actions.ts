"use server";

import { redirect } from "next/navigation";

import { messageRef, type MessageRef, type Translate } from "../../domain/message";
import { PlannedItemValidationError } from "../../domain/planned-item";
import { listAccounts } from "../../ledger/accounts";
import {
  createPlannedItem,
  getPlannedItem,
  PlannedItemNotFoundError,
  updatePlannedItemDetails,
} from "../../ledger/planned-items";
import { withDatabase } from "../../storage/with-database";
import { requireSession } from "../auth/session";
import { refreshData } from "../data-cache";
import { flashError, flashSuccess } from "../feedback/flash";
import { getTranslator } from "../translator";
import type { CurrencyByAccount } from "../transactions/transaction-form-data";
import {
  formFieldOf,
  parsePlannedItemDetailsForm,
  parsePlannedItemForm,
  readSubmittedDetails,
  readSubmittedValues,
  type PlannedItemDetailsFormState,
  type PlannedItemFormState,
} from "./planned-item-form-data";

const PLANNED_PATH = "/planned";
const DETAILS_FIELDS = ["name", "categoryId", "matchWindowDays", "matchTolerancePercent"] as const;

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

/** A failure that no field explains is told in a toast, the typed values come back with it. */
async function toFormState(
  error: unknown,
  formData: FormData,
  translate: Translate,
): Promise<PlannedItemFormState> {
  const values = readSubmittedValues(formData);
  if (error instanceof PlannedItemValidationError) {
    return { field: formFieldOf(error.field), message: translate(error.ref), values };
  }
  const ref = describeFailure(error);
  await flashError(ref);
  return { message: translate(ref), values };
}

async function toDetailsState(
  error: unknown,
  formData: FormData,
  translate: Translate,
): Promise<PlannedItemDetailsFormState> {
  const values = readSubmittedDetails(formData);
  if (error instanceof PlannedItemValidationError) {
    // The edit form has four controls: a refusal on another field is shown as a message.
    const field = DETAILS_FIELDS.find((candidate) => candidate === formFieldOf(error.field));
    return { ...(field === undefined ? {} : { field }), message: translate(error.ref), values };
  }
  const ref = describeFailure(error);
  await flashError(ref);
  return { message: translate(ref), values };
}

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
    return await toFormState(error, formData, translate);
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

  let rejected: PlannedItemDetailsFormState | null;
  try {
    rejected = withDatabase((db) => {
      // The label filter has no control on this form: it is kept as it is.
      const { provisionLabelFilter } = getPlannedItem(db, id);
      const parsed = parsePlannedItemDetailsForm(formData, provisionLabelFilter, translate);
      if (!parsed.ok) return parsed.error;
      updatePlannedItemDetails(db, id, parsed.details);
      return null;
    });
  } catch (error) {
    return await toDetailsState(error, formData, translate);
  }
  if (rejected !== null) return rejected;

  refreshData();
  await flashSuccess("plannedItemUpdated");
  // redirect throws, so it stays outside the try block.
  redirect(PLANNED_PATH);
}
