"use server";

import { revalidatePath } from "next/cache";

import { BalanceAssertionValidationError } from "../../../../domain/balance-assertion";
import { messageRef, type MessageRef, type Translate } from "../../../../domain/message";
import { AccountNotFoundError, getAccount } from "../../../../ledger/accounts";
import {
  BalanceAssertionNotFoundError,
  BalanceAssertionOnArchivedAccountError,
  deleteBalanceAssertion,
  saveBalanceAssertion,
} from "../../../../ledger/balance-assertions";
import { withDatabase } from "../../../../storage/with-database";
import { requireSession } from "../../../auth/session";
import { flashError, flashSuccess, runWithNotice } from "../../../feedback/flash";
import { getTranslator } from "../../../translator";
import {
  parseBalanceAssertionForm,
  readSubmittedValues,
  type BalanceAssertionFormState,
} from "./balance-assertion-form-data";

const balancesPath = (accountId: number) => `/accounts/${accountId}/balances`;

/** A failure that no field explains is told in a toast. */
async function toFormState(
  error: unknown,
  formData: FormData,
  translate: Translate,
): Promise<BalanceAssertionFormState> {
  const values = readSubmittedValues(formData);
  if (error instanceof BalanceAssertionValidationError) {
    return { field: error.field, message: translate(error.ref), values };
  }
  const ref = describeFailure(error);
  await flashError(ref);
  return { message: translate(ref), values };
}

function describeFailure(error: unknown): MessageRef {
  if (error instanceof BalanceAssertionOnArchivedAccountError) {
    return messageRef("balanceAssertionOnArchivedAccount");
  }
  if (error instanceof AccountNotFoundError) return messageRef("accountGone");
  // Unexpected failures are logged with their detail, the user sees a generic message.
  console.error("Balance assertion action failed", error);
  return messageRef("balanceAssertionNotSaved");
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
    return await toFormState(error, formData, translate);
  }

  revalidatePath(balancesPath(accountId));
  await flashSuccess("balanceAssertionSaved");
  return null;
}

function describeDeleteFailure(error: unknown): MessageRef {
  console.error("Balance assertion delete failed", error);
  return messageRef("balanceAssertionNotDeleted");
}

export async function deleteBalanceAssertionAction(
  accountId: number,
  id: number,
): Promise<void> {
  await requireSession();
  await runWithNotice(
    () => {
      try {
        withDatabase((db) => deleteBalanceAssertion(db, accountId, id));
      } catch (error) {
        // Already deleted (second tab, double submit): the goal is reached, the page refreshes.
        if (!(error instanceof BalanceAssertionNotFoundError)) throw error;
      }
    },
    { success: "balanceAssertionDeleted", describeFailure: describeDeleteFailure },
  );
  revalidatePath(balancesPath(accountId));
}
