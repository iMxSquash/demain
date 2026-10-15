import { and, asc, eq, sql } from "drizzle-orm";

import {
  AccountValidationError,
  assertCurrencyChangeAllowed,
  validateAccountInput,
  type AccountInput,
  type ValidAccountInput,
} from "../domain/account";
import {
  assertOverflowTargetAllowed,
  type OverflowAccount,
} from "../domain/overflow";
import type { AppDatabase } from "../storage/database";
import { accounts, transactions } from "../storage/schema";

export type Account = typeof accounts.$inferSelect;

export class AccountNotFoundError extends Error {
  constructor(id: number) {
    super(`Account ${id} does not exist`);
    this.name = "AccountNotFoundError";
  }
}

export class AccountInUseError extends Error {
  constructor(id: number, referrers: string[]) {
    super(
      `Account ${id} is the overflow account of ${referrers.join(", ")}: change those first`,
    );
    this.name = "AccountInUseError";
  }
}

export class AccountNotEmptyError extends Error {
  constructor(id: number, balance: number) {
    super(
      `Account ${id} has a balance of ${balance} minor units: empty it first, then archive it`,
    );
    this.name = "AccountNotEmptyError";
  }
}

export function getAccount(db: AppDatabase, id: number): Account {
  const account = db.select().from(accounts).where(eq(accounts.id, id)).get();
  if (account === undefined) {
    throw new AccountNotFoundError(id);
  }
  return account;
}

/** Opening balance plus every transaction of the account (DOMAIN, invariant 8). */
export function getAccountBalance(db: AppDatabase, id: number): number {
  const account = getAccount(db, id);
  const row = db
    .select({ total: sql<number>`coalesce(sum(${transactions.amount}), 0)` })
    .from(transactions)
    .where(eq(transactions.accountId, id))
    .get();
  return account.openingBalance + (row?.total ?? 0);
}

function hasTransactions(db: AppDatabase, id: number): boolean {
  const row = db
    .select({ id: transactions.id })
    .from(transactions)
    .where(eq(transactions.accountId, id))
    .limit(1)
    .get();
  return row !== undefined;
}

/**
 * Every account, archived ones included (the chain is a graph), with its
 * computed balance, in the shape the pure routing functions expect.
 */
export function listOverflowAccounts(db: AppDatabase): OverflowAccount[] {
  const movements = sql<number>`(select coalesce(sum(${transactions.amount}), 0) from ${transactions} where ${transactions.accountId} = ${accounts.id})`;
  return db
    .select({
      id: accounts.id,
      currency: accounts.currency,
      archived: accounts.archived,
      balance: sql<number>`${accounts.openingBalance} + ${movements}`,
      ceiling: accounts.depositCeiling,
      overflowAccountId: accounts.overflowAccountId,
    })
    .from(accounts)
    .orderBy(asc(accounts.id))
    .all();
}

// An archived referrer is ignored: it cannot be edited any more, so counting
// it would lock the target for good.
function findActiveReferrers(db: AppDatabase, id: number) {
  return db
    .select({ name: accounts.name, currency: accounts.currency })
    .from(accounts)
    .where(and(eq(accounts.overflowAccountId, id), eq(accounts.archived, false)))
    .all();
}

// An update replaces the whole account: an omitted optional field means
// "none", whereas Drizzle would skip an undefined value and keep the old one.
function toRow(valid: ValidAccountInput) {
  return {
    ...valid,
    depositCeiling: valid.depositCeiling ?? null,
    overflowAccountId: valid.overflowAccountId ?? null,
  };
}

// Checked against every stored account, archived ones included, because the
// chain is a graph and not a single field.
function assertOverflowAllowed(
  db: AppDatabase,
  accountId: number | null,
  input: AccountInput,
): void {
  if (input.overflowAccountId === null || input.overflowAccountId === undefined) {
    return;
  }
  assertOverflowTargetAllowed(
    { id: accountId, currency: input.currency },
    input.overflowAccountId,
    listAccounts(db, { includeArchived: true }),
  );
}

export function createAccount(db: AppDatabase, input: AccountInput): Account {
  const valid = validateAccountInput(input);
  assertOverflowAllowed(db, null, valid);
  return db.insert(accounts).values(toRow(valid)).returning().get();
}

export function listAccounts(
  db: AppDatabase,
  { includeArchived = false }: { includeArchived?: boolean } = {},
): Account[] {
  const query = db.select().from(accounts);
  const rows = includeArchived
    ? query
    : query.where(eq(accounts.archived, false));
  // SQLite gives no order guarantee without ORDER BY: keep creation order.
  return rows.orderBy(asc(accounts.id)).all();
}

export function updateAccount(
  db: AppDatabase,
  id: number,
  input: AccountInput,
): Account {
  const current = getAccount(db, id);
  const valid = validateAccountInput(input);
  assertOverflowAllowed(db, id, valid);
  const mismatched = findActiveReferrers(db, id).find(
    (referrer) => referrer.currency !== valid.currency,
  );
  if (mismatched !== undefined) {
    throw new AccountValidationError(
      "currency",
      `The currency cannot change while ${mismatched.name} uses this account as its overflow account`,
    );
  }
  assertCurrencyChangeAllowed(current.currency, valid.currency, {
    hasTransactions: hasTransactions(db, id),
  });
  return db
    .update(accounts)
    .set(toRow(valid))
    .where(eq(accounts.id, id))
    .returning()
    .get();
}

export function archiveAccount(db: AppDatabase, id: number): void {
  // A negative balance blocks the archiving as well (DOMAIN, archiving an account).
  const balance = getAccountBalance(db, id);
  if (balance !== 0) {
    throw new AccountNotEmptyError(id, balance);
  }
  const referrers = findActiveReferrers(db, id);
  if (referrers.length > 0) {
    throw new AccountInUseError(
      id,
      referrers.map((referrer) => referrer.name),
    );
  }
  db.update(accounts).set({ archived: true }).where(eq(accounts.id, id)).run();
}
