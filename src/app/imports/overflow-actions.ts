"use server";

import { getTimeZone } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { AccountValidationError } from "../../domain/account";
import { messageRef } from "../../domain/message";
import type { OverflowAccount } from "../../domain/overflow";
import { todayIn } from "../../i18n/dates";
import { AccountNotFoundError } from "../../ledger/accounts";
import {
  createOverflowCandidate,
  setImportOverflowAccount,
} from "../../ledger/import-overflow";
import { withDatabase } from "../../storage/with-database";
import { requireSession } from "../auth/session";
import { revalidateLedger } from "../revalidate-ledger";
import { getTranslator } from "../translator";
import type { OverflowActionState } from "./import-form-data";

const MAX_ACCOUNT_NAME_LENGTH = 200;
const IMPORTS_PATH = "/imports";

// The review offers the accounts of the page: it must see the one just made or linked.
function refreshAccounts(): void {
  revalidateLedger();
  revalidatePath(IMPORTS_PATH);
}

const id = z.number().int().min(1);

const chooseSchema = z.strictObject({
  receivingAccountId: id,
  accountId: id,
  overflowAccountId: id,
});

const createSchema = z.strictObject({
  likeAccountId: id,
  name: z.string().max(MAX_ACCOUNT_NAME_LENGTH),
});

async function describeFailure(error: unknown): Promise<string> {
  const translate = await getTranslator();
  if (error instanceof AccountValidationError) return translate(error.ref);
  if (error instanceof AccountNotFoundError) return translate(messageRef("accountGone"));
  // Unexpected failures are logged with their detail, the user sees a generic message.
  console.error("Overflow account action failed", error);
  return translate(messageRef("accountNotSaved"));
}

/**
 * Makes the account the overflow account of a savings account, for good. The
 * ledger applies the rules of any save of an account: nothing is trusted here.
 */
export async function chooseOverflowAccountAction(
  request: z.input<typeof chooseSchema>,
): Promise<OverflowActionState> {
  await requireSession();
  const parsed = chooseSchema.safeParse(request);
  if (!parsed.success) {
    return { status: "error", message: await describeFailure(parsed.error) };
  }
  try {
    withDatabase((db) => setImportOverflowAccount(db, parsed.data));
  } catch (error) {
    return { status: "error", message: await describeFailure(error) };
  }
  refreshAccounts();
  return { status: "done" };
}

/** Creates the account the user types in the review: it still has to be chosen. */
export async function createOverflowAccountAction(
  request: z.input<typeof createSchema>,
): Promise<OverflowActionState> {
  await requireSession();
  const parsed = createSchema.safeParse(request);
  if (!parsed.success) {
    return { status: "error", message: await describeFailure(parsed.error) };
  }
  try {
    const timeZone = await getTimeZone();
    const account = withDatabase((db) =>
      createOverflowCandidate(db, {
        ...parsed.data,
        openingDate: todayIn(timeZone, new Date()),
      }),
    );
    refreshAccounts();
    const snapshot: OverflowAccount = {
      id: account.id,
      currency: account.currency,
      archived: false,
      balance: 0,
      ceiling: null,
      overflowAccountId: null,
    };
    return { status: "created", account: snapshot, name: account.name };
  } catch (error) {
    return { status: "error", message: await describeFailure(error) };
  }
}
