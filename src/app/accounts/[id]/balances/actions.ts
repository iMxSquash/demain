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
  type SavedBalanceAssertion,
} from "../../../../ledger/balance-assertions";
import { withDatabase } from "../../../../storage/with-database";
import { requireSession } from "../../../auth/session";
import { flashError, flashSuccess, runWithNotice } from "../../../feedback/flash";
import { getTranslator } from "../../../translator";
import {
  parseAccountId,
  parseBalanceAssertionForm,
  readSubmittedValues,
  type BalanceAssertionFormState,
} from "./balance-assertion-form-data";

const ALL_BALANCES_PATH = "/balances";
const balancesPath = (accountId: number) => `/accounts/${accountId}/balances`;

function revalidateBalances(accountId: number): void {
  revalidatePath(balancesPath(accountId));
  revalidatePath(ALL_BALANCES_PATH);
}

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

  let saved: SavedBalanceAssertion;
  try {
    const outcome = withDatabase((db) => {
      // The amount is read in the currency of the account, so it is loaded first.
      const { currency } = getAccount(db, accountId);
      const parsed = parseBalanceAssertionForm(
        formData,
        accountId,
        currency,
        translate,
      );
      if (!parsed.ok) return parsed;
      return { ok: true as const, saved: saveBalanceAssertion(db, parsed.input) };
    });
    if (!outcome.ok) return outcome.error;
    saved = outcome.saved;
  } catch (error) {
    return await toFormState(error, formData, translate);
  }

  revalidateBalances(accountId);
  // Replacing a balance is told, so that nobody believes a second one was added.
  if (saved.replaced) {
    await flashSuccess("balanceAssertionReplaced", { date: saved.date });
  } else {
    await flashSuccess("balanceAssertionSaved");
  }
  return null;
}

/** The form of `/balances`: the account is a field of the form, not of the route. */
export async function saveBalanceAssertionForChosenAccountAction(
  previous: BalanceAssertionFormState | null,
  formData: FormData,
): Promise<BalanceAssertionFormState | null> {
  await requireSession();
  const accountId = parseAccountId(formData);
  if (accountId === null) {
    const translate = await getTranslator();
    return {
      field: "accountId",
      message: translate(messageRef("balanceAssertionAccountRequired")),
      values: readSubmittedValues(formData),
    };
  }
  return saveBalanceAssertionAction(accountId, previous, formData);
}

function describeDeleteFailure(error: unknown): MessageRef {
  if (error instanceof BalanceAssertionOnArchivedAccountError) {
    return messageRef("balanceAssertionOnArchivedAccount");
  }
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
  revalidateBalances(accountId);
}
