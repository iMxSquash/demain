import { and, desc, eq } from "drizzle-orm";

import {
  computeUnexplainedGap,
  validateBalanceAssertionInput,
  type BalanceAssertionInput,
  type UnexplainedGap,
} from "../domain/balance-assertion";
import type { AppDatabase } from "../storage/database";
import { balanceAssertions, transactions } from "../storage/schema";
import { getAccount } from "./accounts";

export type BalanceAssertion = typeof balanceAssertions.$inferSelect;

export type BalanceAssertionWithGap = BalanceAssertion & UnexplainedGap;

export class BalanceAssertionNotFoundError extends Error {
  constructor(id: number) {
    super(`Balance assertion ${id} does not exist`);
    this.name = "BalanceAssertionNotFoundError";
  }
}

export class BalanceAssertionOnArchivedAccountError extends Error {
  constructor(accountId: number) {
    super(`Account ${accountId} is archived: no balance can be recorded on it`);
    this.name = "BalanceAssertionOnArchivedAccountError";
  }
}

/**
 * Records the balance of an account at a date, replacing the one of the same
 * day. An archived account is no longer used (DOMAIN, archiving an account),
 * but the assertions it already has stay listed.
 */
export function saveBalanceAssertion(
  db: AppDatabase,
  input: BalanceAssertionInput,
): BalanceAssertion {
  const account = getAccount(db, input.accountId);
  if (account.archived) {
    throw new BalanceAssertionOnArchivedAccountError(account.id);
  }
  const valid = validateBalanceAssertionInput(input, account);
  return db
    .insert(balanceAssertions)
    .values(valid)
    .onConflictDoUpdate({
      target: [balanceAssertions.accountId, balanceAssertions.date],
      set: { amount: valid.amount, note: valid.note },
    })
    .returning()
    .get();
}

/** The assertions of an account, most recent first, each with its unexplained gap. */
export function listBalanceAssertions(
  db: AppDatabase,
  accountId: number,
): BalanceAssertionWithGap[] {
  const account = getAccount(db, accountId);
  const movements = db
    .select({
      accountId: transactions.accountId,
      date: transactions.date,
      amount: transactions.amount,
    })
    .from(transactions)
    .where(eq(transactions.accountId, accountId))
    .all();
  return db
    .select()
    .from(balanceAssertions)
    .where(eq(balanceAssertions.accountId, accountId))
    .orderBy(desc(balanceAssertions.date))
    .all()
    .map((assertion) => ({
      ...assertion,
      ...computeUnexplainedGap(account, movements, assertion),
    }));
}

/** Deletes an assertion of the given account: an id of another account matches nothing. */
export function deleteBalanceAssertion(
  db: AppDatabase,
  accountId: number,
  id: number,
): void {
  const deleted = db
    .delete(balanceAssertions)
    .where(
      and(
        eq(balanceAssertions.id, id),
        eq(balanceAssertions.accountId, accountId),
      ),
    )
    .returning({ id: balanceAssertions.id })
    .get();
  if (deleted === undefined) {
    throw new BalanceAssertionNotFoundError(id);
  }
}
