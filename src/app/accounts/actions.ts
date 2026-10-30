"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { AccountValidationError } from "../../domain/account";
import { messageRef, type MessageRef, type Translate } from "../../domain/message";
import {
  AccountInUseError,
  AccountNotEmptyError,
  AccountNotFoundError,
  archiveAccount,
  createAccount,
  updateAccount,
} from "../../ledger/accounts";
import { withDatabase } from "../../storage/with-database";
import { requireSession } from "../auth/session";
import { flashError, flashSuccess, runWithNotice } from "../feedback/flash";
import { getTranslator } from "../translator";
import {
  parseAccountForm,
  readSubmittedValues,
  type AccountFormState,
} from "./account-form-data";

const ACCOUNTS_PATH = "/accounts";

/** A failure that no field explains is told in a toast, the typed values come back with it. */
async function toFormState(
  error: unknown,
  formData: FormData,
  translate: Translate,
): Promise<AccountFormState> {
  const values = readSubmittedValues(formData);
  if (error instanceof AccountValidationError) {
    return { field: error.field, message: translate(error.ref), values };
  }
  const ref = describeFailure(error);
  await flashError(ref);
  return { message: translate(ref), values };
}

function describeFailure(error: unknown): MessageRef {
  if (error instanceof AccountNotFoundError) return messageRef("accountGone");
  // Unexpected failures are logged with their detail, the user sees a generic message.
  console.error("Account action failed", error);
  return messageRef("accountNotSaved");
}

function describeArchiveFailure(error: unknown): MessageRef {
  if (error instanceof AccountNotFoundError) return messageRef("accountGone");
  if (error instanceof AccountNotEmptyError) return messageRef("accountNotEmpty");
  if (error instanceof AccountInUseError) return messageRef("accountInUse");
  console.error("Account archive failed", error);
  return messageRef("accountNotArchived");
}

export async function createAccountAction(
  _previous: AccountFormState | null,
  formData: FormData,
): Promise<AccountFormState | null> {
  await requireSession();
  const translate = await getTranslator();
  const parsed = parseAccountForm(formData, translate);
  if (!parsed.ok) return parsed.error;

  try {
    withDatabase((db) => createAccount(db, parsed.input));
  } catch (error) {
    return await toFormState(error, formData, translate);
  }

  revalidatePath(ACCOUNTS_PATH);
  await flashSuccess("accountCreated");
  return null;
}

export async function updateAccountAction(
  id: number,
  _previous: AccountFormState | null,
  formData: FormData,
): Promise<AccountFormState | null> {
  await requireSession();
  const translate = await getTranslator();
  const parsed = parseAccountForm(formData, translate);
  if (!parsed.ok) return parsed.error;

  try {
    withDatabase((db) => updateAccount(db, id, parsed.input));
  } catch (error) {
    return await toFormState(error, formData, translate);
  }

  revalidatePath(ACCOUNTS_PATH);
  await flashSuccess("accountUpdated");
  // redirect throws, so it stays outside the try block.
  redirect(ACCOUNTS_PATH);
}

export async function archiveAccountAction(id: number): Promise<void> {
  await requireSession();
  await runWithNotice(() => withDatabase((db) => archiveAccount(db, id)), {
    success: "accountArchived",
    describeFailure: describeArchiveFailure,
  });
  revalidatePath(ACCOUNTS_PATH);
}
