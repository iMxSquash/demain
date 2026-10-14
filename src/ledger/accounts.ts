import { eq } from "drizzle-orm";

import {
  assertCurrencyChangeAllowed,
  validateAccountInput,
  type AccountInput,
} from "../domain/account";
import type { AppDatabase } from "../storage/database";
import { accounts } from "../storage/schema";

export type Account = typeof accounts.$inferSelect;

export class AccountNotFoundError extends Error {
  constructor(id: number) {
    super(`Account ${id} does not exist`);
    this.name = "AccountNotFoundError";
  }
}

export function getAccount(db: AppDatabase, id: number): Account {
  const account = db.select().from(accounts).where(eq(accounts.id, id)).get();
  if (account === undefined) {
    throw new AccountNotFoundError(id);
  }
  return account;
}

export function createAccount(db: AppDatabase, input: AccountInput): Account {
  const valid = validateAccountInput(input);
  return db.insert(accounts).values(valid).returning().get();
}

export function listAccounts(
  db: AppDatabase,
  { includeArchived = false }: { includeArchived?: boolean } = {},
): Account[] {
  const query = db.select().from(accounts);
  return includeArchived
    ? query.all()
    : query.where(eq(accounts.archived, false)).all();
}

export function updateAccount(
  db: AppDatabase,
  id: number,
  input: AccountInput,
): Account {
  const current = getAccount(db, id);
  const valid = validateAccountInput(input);
  // Transactions arrive with issue #9: until then no account can have any, and
  // that issue replaces this constant with a real query.
  assertCurrencyChangeAllowed(current.currency, valid.currency, {
    hasTransactions: false,
  });
  return db
    .update(accounts)
    .set(valid)
    .where(eq(accounts.id, id))
    .returning()
    .get();
}

export function archiveAccount(db: AppDatabase, id: number): void {
  getAccount(db, id);
  db.update(accounts).set({ archived: true }).where(eq(accounts.id, id)).run();
}
