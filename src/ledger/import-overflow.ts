import { AccountValidationError } from "../domain/account";
import type { PendingOverflow } from "../domain/import-overflow";
import { messageRef } from "../domain/message";
import type { AppDatabase } from "../storage/database";
import { createAccount, getAccount, updateAccount, type Account } from "./accounts";

export interface ImportOverflowChoice {
  /** The account that receives the file: the surplus cannot move back to it. */
  receivingAccountId: number;
  /** The account with a ceiling whose surplus has nowhere to go. */
  accountId: number;
  overflowAccountId: number;
}

/**
 * Makes `overflowAccountId` the overflow account of `accountId`, for good. The
 * cycle, currency and archive rules are those of any save of an account
 * (ADR-013): they run in `updateAccount`. The review only asks when there is
 * none, so a link that already exists is never replaced from here.
 */
export function setImportOverflowAccount(
  db: AppDatabase,
  { receivingAccountId, accountId, overflowAccountId }: ImportOverflowChoice,
): Account {
  if (overflowAccountId === receivingAccountId) {
    throw new AccountValidationError(
      "overflowAccountId",
      "The overflow account cannot be the account that receives the file",
      messageRef("importOverflowIsReceiving"),
    );
  }
  const account = getAccount(db, accountId);
  // The same link saved by an earlier file of the same review is not a replacement.
  if (account.overflowAccountId === overflowAccountId) return account;
  if (account.overflowAccountId !== null) {
    throw new AccountValidationError(
      "overflowAccountId",
      "The account already has an overflow account",
      messageRef("importOverflowAlreadySet"),
    );
  }
  return updateAccount(db, accountId, {
    name: account.name,
    kind: account.kind,
    currency: account.currency,
    openingDate: account.openingDate,
    openingBalance: account.openingBalance,
    depositCeiling: account.depositCeiling,
    overflowAccountId,
  });
}

export interface OverflowCandidateRequest {
  /** The account that will overflow to the new one: it gives the currency. */
  likeAccountId: number;
  name: string;
  /** YYYY-MM-DD. */
  openingDate: string;
}

/** A savings account with no ceiling and no balance, in the currency of `likeAccountId`. */
export function createOverflowCandidate(
  db: AppDatabase,
  { likeAccountId, name, openingDate }: OverflowCandidateRequest,
): Account {
  const { currency } = getAccount(db, likeAccountId);
  return createAccount(db, {
    name,
    kind: "savings",
    currency,
    openingDate,
    openingBalance: 0,
  });
}

export interface ApplyImportOverflowRequest {
  /** The account that receives the file. */
  receivingAccountId: number;
  choices: readonly PendingOverflow[];
  /** YYYY-MM-DD, the opening date of the accounts created. */
  openingDate: string;
}

/**
 * Saves what the review chose, in the transaction of the import: the accounts
 * to create, then the links. Applying a choice that an earlier file of the same
 * review already saved changes nothing, so every file can carry all the choices.
 * Any refusal throws and the caller rolls the import back with it.
 */
export function applyImportOverflowChoices(
  db: AppDatabase,
  { receivingAccountId, choices, openingDate }: ApplyImportOverflowRequest,
): void {
  for (const { accountId, target } of choices) {
    const overflowAccountId =
      target.kind === "existing"
        ? target.id
        : (findSavedOverflowByName(db, accountId, target.name) ??
          createOverflowCandidate(db, {
            likeAccountId: accountId,
            name: target.name,
            openingDate,
          }).id);
    setImportOverflowAccount(db, { receivingAccountId, accountId, overflowAccountId });
  }
}

/** The account an earlier file of the review created and linked under this name, if any. */
function findSavedOverflowByName(
  db: AppDatabase,
  accountId: number,
  name: string,
): number | null {
  const { overflowAccountId } = getAccount(db, accountId);
  if (overflowAccountId === null) return null;
  return getAccount(db, overflowAccountId).name === name.trim() ? overflowAccountId : null;
}
