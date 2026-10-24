"use server";

import { revalidatePath } from "next/cache";

import { BalanceAssertionValidationError } from "../../../../domain/balance-assertion";
import { messageRef, type Translate } from "../../../../domain/message";
import { AccountNotFoundError, getAccount } from "../../../../ledger/accounts";
import {
  BalanceAssertionNotFoundError,
  BalanceAssertionOnArchivedAccountError,
  deleteBalanceAssertion,
  saveBalanceAssertion,
} from "../../../../ledger/balance-assertions";
import { withDatabase } from "../../../../storage/with-database";
import { requireSession } from "../../../auth/session";
import { getTranslator } from "../../../translator";
import {
  parseBalanceAssertionForm,
  readSubmittedValues,
  type BalanceAssertionFormState,
} from "./balance-assertion-form-data";

const balancesPath = (accountId: number) => `/accounts/${accountId}/balances`;

function toFormState(
  error: unknown,
  formData: FormData,
  translate: Translate,
): BalanceAssertionFormState {
  const values = readSubmittedValues(formData);
  if (error instanceof BalanceAssertionValidationError) {
    return { field: error.field, message: translate(error.ref), values };
  }
  if (error instanceof BalanceAssertionOnArchivedAccountError) {
    return { message: translate(messageRef("balanceAssertionOnArchivedAccount")), values };
  }
  if (error instanceof AccountNotFoundError) {
    return { message: translate(messageRef("accountGone")), values };
  }
  // Unexpected failures are logged with their detail, the user sees a generic message.
  console.error("Balance assertion action failed", error);
  return { message: translate(messageRef("balanceAssertionNotSaved")), values };
}

export async function saveBalanceAssertionAction(
  accountId: number,
  _previous: BalanceAssertionFormState | null,
  formData: FormData,
): Promise<BalanceAssertionFormState | null> {
  await requireSession();
  const translate = await getTranslator();

  try {
    const failure = withDatabase((db) => {
      // The amount is read in the currency of the account, so it is loaded first.
      const { currency } = getAccount(db, accountId);
      const parsed = parseBalanceAssertionForm(
        formData,
        accountId,
        currency,
        translate,
      );
      if (!parsed.ok) return parsed.error;
      saveBalanceAssertion(db, parsed.input);
      return null;
    });
    if (failure !== null) return failure;
  } catch (error) {
    return toFormState(error, formData, translate);
  }

  revalidatePath(balancesPath(accountId));
  return null;
}

export async function deleteBalanceAssertionAction(
  accountId: number,
  id: number,
): Promise<void> {
  await requireSession();
  try {
    withDatabase((db) => deleteBalanceAssertion(db, accountId, id));
  } catch (error) {
    // Already deleted (second tab, double submit): the goal is reached, the page refreshes.
    if (!(error instanceof BalanceAssertionNotFoundError)) throw error;
  }
  revalidatePath(balancesPath(accountId));
}
