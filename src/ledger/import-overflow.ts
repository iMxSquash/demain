import { AccountValidationError } from "../domain/account";
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
