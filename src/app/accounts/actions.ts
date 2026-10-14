"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { AccountValidationError } from "../../domain/account";
import {
  AccountNotFoundError,
  archiveAccount,
  createAccount,
  updateAccount,
} from "../../ledger/accounts";
import { withDatabase } from "../../storage/with-database";
import {
  parseAccountForm,
  readSubmittedValues,
  type AccountFormState,
} from "./account-form-data";

const ACCOUNTS_PATH = "/accounts";

function toFormState(error: unknown, formData: FormData): AccountFormState {
  const values = readSubmittedValues(formData);
  if (error instanceof AccountValidationError) {
    return { field: error.field, message: error.message, values };
  }
  if (error instanceof AccountNotFoundError) {
    return { message: "This account no longer exists.", values };
  }
  // Unexpected failures are logged with their detail, the user sees a generic message.
  console.error("Account action failed", error);
  return { message: "Something went wrong, the account was not saved.", values };
}

export async function createAccountAction(
  _previous: AccountFormState | null,
  formData: FormData,
): Promise<AccountFormState | null> {
  const parsed = parseAccountForm(formData);
  if (!parsed.ok) return parsed.error;

  try {
    withDatabase((db) => createAccount(db, parsed.input));
  } catch (error) {
    return toFormState(error, formData);
  }

  revalidatePath(ACCOUNTS_PATH);
  return null;
}

export async function updateAccountAction(
  id: number,
  _previous: AccountFormState | null,
  formData: FormData,
): Promise<AccountFormState | null> {
  const parsed = parseAccountForm(formData);
  if (!parsed.ok) return parsed.error;

  try {
    withDatabase((db) => updateAccount(db, id, parsed.input));
  } catch (error) {
    return toFormState(error, formData);
  }

  revalidatePath(ACCOUNTS_PATH);
  // redirect throws, so it stays outside the try block.
  redirect(ACCOUNTS_PATH);
}

export async function archiveAccountAction(id: number): Promise<void> {
  withDatabase((db) => archiveAccount(db, id));
  revalidatePath(ACCOUNTS_PATH);
}
