import { and, asc, desc, eq, inArray } from "drizzle-orm";

import {
  computeUnexplainedGap,
  type AssertionMovement,
  type AssertionSnapshot,
  validateBalanceAssertionInput,
  type BalanceAssertionInput,
  type ValidBalanceAssertionInput,
  type UnexplainedGap,
} from "../domain/balance-assertion";
import type { AssertionLinkSnapshot } from "../domain/import-assertions";
import type { AppDatabase } from "../storage/database";
import { accounts, balanceAssertions, transactions } from "../storage/schema";
import { getAccount, listAccounts } from "./accounts";

export type BalanceAssertion = typeof balanceAssertions.$inferSelect;

export type BalanceAssertionWithGap = BalanceAssertion & UnexplainedGap;

/** An assertion that took the place of one of the same account and date, or not. */
export type SavedBalanceAssertion = BalanceAssertion & { replaced: boolean };

export type AccountBalanceAssertion = BalanceAssertionWithGap & {
  accountName: string;
  accountCurrency: string;
  /** Derived from the account: an archived account keeps its assertions as they are. */
  accountArchived: boolean;
};

export class BalanceAssertionNotFoundError extends Error {
  constructor(id: number) {
    super(`Balance assertion ${id} does not exist`);
    this.name = "BalanceAssertionNotFoundError";
  }
}

export class BalanceAssertionOnArchivedAccountError extends Error {
  constructor(accountId: number) {
    super(`Account ${accountId} is archived: its balances can no longer be changed`);
    this.name = "BalanceAssertionOnArchivedAccountError";
  }
}

/**
 * Records the balance of an account at a date, replacing the one of the same
 * day (`replaced` tells it). An archived account is no longer used (DOMAIN,
 * archiving an account): its assertions can be neither added, replaced nor
 * deleted, but they stay listed.
 */
export function saveBalanceAssertion(
  db: AppDatabase,
  input: BalanceAssertionInput,
): SavedBalanceAssertion {
  const account = getAccount(db, input.accountId);
  if (account.archived) {
    throw new BalanceAssertionOnArchivedAccountError(account.id);
  }
  const valid = validateBalanceAssertionInput(input, account);
  return db.transaction((tx) => recordValidAssertion(tx, valid));
}

/** Upserts an assertion that already went through the validation, inside the caller's transaction. */
export function recordValidAssertion(
  tx: Pick<AppDatabase, "select" | "insert">,
  valid: ValidBalanceAssertionInput,
): SavedBalanceAssertion {
  const existing = tx
    .select({ id: balanceAssertions.id })
    .from(balanceAssertions)
    .where(
      and(
        eq(balanceAssertions.accountId, valid.accountId),
        eq(balanceAssertions.date, valid.date),
      ),
    )
    .get();
  const saved = tx
    .insert(balanceAssertions)
    .values(valid)
    .onConflictDoUpdate({
      target: [balanceAssertions.accountId, balanceAssertions.date],
      set: { amount: valid.amount, note: valid.note },
    })
    .returning()
    .get();
  return { ...saved, replaced: existing !== undefined };
}

/** Every movement of an account, the input of the computed balance. */
export function listAccountMovements(
  db: AppDatabase,
  accountId: number,
): AssertionMovement[] {
  return db
    .select({
      accountId: transactions.accountId,
      date: transactions.date,
      amount: transactions.amount,
    })
    .from(transactions)
    .where(eq(transactions.accountId, accountId))
    .all();
}

/** The assertions of an account, most recent first, each with its unexplained gap. */
export function listBalanceAssertions(
  db: AppDatabase,
  accountId: number,
): BalanceAssertionWithGap[] {
  const account = getAccount(db, accountId);
  const movements = listAccountMovements(db, accountId);
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

/**
 * Every assertion of every account, archived ones included, most recent
 * first, each with its unexplained gap and the account it belongs to.
 */
export function listAllBalanceAssertions(
  db: AppDatabase,
): AccountBalanceAssertion[] {
  const accounts = new Map(
    listAccounts(db, { includeArchived: true }).map((account) => [
      account.id,
      account,
    ]),
  );
  // Grouped once, so that each gap only walks the movements of its own account.
  const movementsByAccount = Map.groupBy(
    db
      .select({
        accountId: transactions.accountId,
        date: transactions.date,
        amount: transactions.amount,
      })
      .from(transactions)
      .all(),
    (movement) => movement.accountId,
  );
  return db
    .select()
    .from(balanceAssertions)
    .orderBy(desc(balanceAssertions.date), asc(balanceAssertions.accountId))
    .all()
    .map((assertion) => {
      // The foreign key guarantees the account exists.
      const account = accounts.get(assertion.accountId)!;
      return {
        ...assertion,
        ...computeUnexplainedGap(
          account,
          movementsByAccount.get(account.id) ?? [],
          assertion,
        ),
        accountName: account.name,
        accountCurrency: account.currency,
        accountArchived: account.archived,
      };
    });
}

/**
 * The assertions of the active accounts, in the shape the review of an import
 * compares with the balances a file leaves. An archived account is frozen
 * (DOMAIN, archiving an account): nothing it holds is checked.
 */
export function listAssertionSnapshots(db: AppDatabase): AssertionSnapshot[] {
  return db
    .select({
      id: balanceAssertions.id,
      accountId: balanceAssertions.accountId,
      date: balanceAssertions.date,
      amount: balanceAssertions.amount,
    })
    .from(balanceAssertions)
    .innerJoin(accounts, eq(accounts.id, balanceAssertions.accountId))
    .where(eq(accounts.archived, false))
    .orderBy(asc(balanceAssertions.date), asc(balanceAssertions.id))
    .all();
}

/**
 * What the review of an import compares a file with: the active accounts that
 * hold an assertion, their movements and the assertions. An account without an
 * assertion is left out, its balance is never compared, which keeps the payload
 * the page sends to the browser small.
 */
export function readAssertionLinkSnapshot(db: AppDatabase): AssertionLinkSnapshot {
  const assertions = listAssertionSnapshots(db);
  const assertedIds = [...new Set(assertions.map(({ accountId }) => accountId))];
  if (assertedIds.length === 0) return { accounts: [], transactions: [], assertions: [] };
  return {
    accounts: db
      .select({ id: accounts.id, openingBalance: accounts.openingBalance })
      .from(accounts)
      .where(inArray(accounts.id, assertedIds))
      .orderBy(asc(accounts.id))
      .all(),
    transactions: db
      .select({
        accountId: transactions.accountId,
        date: transactions.date,
        amount: transactions.amount,
      })
      .from(transactions)
      .where(inArray(transactions.accountId, assertedIds))
      .all(),
    assertions,
  };
}

/**
 * Deletes an assertion of the given account: an id of another account matches
 * nothing. An archived account keeps its assertions.
 */
export function deleteBalanceAssertion(
  db: AppDatabase,
  accountId: number,
  id: number,
): void {
  if (getAccount(db, accountId).archived) {
    throw new BalanceAssertionOnArchivedAccountError(accountId);
  }
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
