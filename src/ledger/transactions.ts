import { and, asc, eq, inArray, isNull, ne } from "drizzle-orm";

import { assertCategoryAssignable } from "../domain/category";
import { validateRuleValue, type RuleOperator } from "../domain/categorization-rule";
import {
  buildTransferLegs,
  ceilingWarningFor,
  splitManualTransfer,
  TransactionValidationError,
  validateTransactionInput,
  type CeilingWarning,
  type ManualTransferSplit,
  type TransactionInput,
  type TransferLeg,
} from "../domain/transaction";
import { messageRef } from "../domain/message";
import type { OverflowAccount } from "../domain/overflow";
import type { AppDatabase } from "../storage/database";
import { transactions } from "../storage/schema";
import {
  getAccount,
  getAccountBalance,
  listOverflowAccounts,
  type Account,
} from "./accounts";
import { getCategory } from "./categories";
import { insertRule } from "./categorization-rules";

export type Transaction = typeof transactions.$inferSelect;

export class TransactionNotFoundError extends Error {
  constructor(id: number) {
    super(`Transaction ${id} does not exist`);
    this.name = "TransactionNotFoundError";
  }
}

export function getTransaction(db: AppDatabase, id: number): Transaction {
  const transaction = db
    .select()
    .from(transactions)
    .where(eq(transactions.id, id))
    .get();
  if (transaction === undefined) {
    throw new TransactionNotFoundError(id);
  }
  return transaction;
}

// An archived account holds nothing and takes no entered movement (DOMAIN,
// archiving an account). Imports are the documented exception, handled apart.
function getOpenAccount(db: AppDatabase, id: number): Account {
  const account = getAccount(db, id);
  if (account.archived) {
    throw new TransactionValidationError(
      "accountId",
      "No transaction can be entered on an archived account",
      messageRef("transactionOnArchivedAccount"),
    );
  }
  return account;
}

// A category is checked when it is newly chosen: an archived one stays on the
// transactions that already carry it, and clearing a category is always allowed.
function assertCategoryChoice(
  db: AppDatabase,
  kind: Transaction["kind"],
  categoryId: number | null,
  currentCategoryId: number | null,
): void {
  if (categoryId === null || categoryId === currentCategoryId) return;
  assertCategoryAssignable(kind, getCategory(db, categoryId));
}

export function createTransaction(
  db: AppDatabase,
  input: TransactionInput,
): Transaction {
  const valid = validateTransactionInput(input);
  getOpenAccount(db, valid.accountId);
  assertCategoryChoice(db, valid.kind, valid.categoryId, null);
  return db.insert(transactions).values(valid).returning().get();
}

export interface TransferRequest {
  sourceId: number;
  destinationId: number;
  /** Positive integer in minor units, the amount leaving the source. */
  amount: number;
  date: string;
  label: string;
}

type Writer = Pick<AppDatabase, "insert" | "update">;

// Validates the request against the stored accounts and returns the two legs.
function buildLegsFor(
  db: AppDatabase,
  request: TransferRequest,
): [outgoing: TransferLeg, incoming: TransferLeg] {
  return buildTransferLegs({
    source: getOpenAccount(db, request.sourceId),
    destination: getOpenAccount(db, request.destinationId),
    amount: request.amount,
    date: request.date,
    label: request.label,
  });
}

function insertTransferLegs(
  writer: Writer,
  [outgoingLeg, incomingLeg]: [TransferLeg, TransferLeg],
): [outgoing: Transaction, incoming: Transaction] {
  const outgoing = writer
    .insert(transactions)
    .values(outgoingLeg)
    .returning()
    .get();
  const incoming = writer
    .insert(transactions)
    .values({ ...incomingLeg, transferCounterpartId: outgoing.id })
    .returning()
    .get();
  const linked = writer
    .update(transactions)
    .set({ transferCounterpartId: incoming.id })
    .where(eq(transactions.id, outgoing.id))
    .returning()
    .get();
  return [linked, incoming];
}

/**
 * Records the two legs of a transfer. The caller has already settled any
 * ceiling split (DOMAIN, deposit ceiling and overflow): the amount given is
 * what is really transferred.
 */
export function createTransfer(
  db: AppDatabase,
  request: TransferRequest,
): [outgoing: Transaction, incoming: Transaction] {
  const legs = buildLegsFor(db, request);
  // Both legs or none: a lone leg would break invariant 3.
  return db.transaction((tx) => insertTransferLegs(tx, legs));
}

export type SurplusDecision =
  | { kind: "room-only" }
  | { kind: "send-surplus"; accountId: number };

export interface ManualTransferResult {
  transfers: [outgoing: Transaction, incoming: Transaction][];
  /** Part that stays in the source account because it fits nowhere. */
  unplaced: number;
}

export class SurplusDecisionRequiredError extends Error {
  constructor(readonly split: ManualTransferSplit) {
    super(
      `${split.surplus} minor units do not fit under the ceiling: a decision is required`,
    );
    this.name = "SurplusDecisionRequiredError";
  }
}

function splitFor(
  request: TransferRequest,
  accounts: readonly OverflowAccount[],
): ManualTransferSplit {
  return splitManualTransfer(request.amount, request.destinationId, accounts);
}

/** The split shown before recording a transfer entered by hand. */
export function previewManualTransfer(
  db: AppDatabase,
  request: TransferRequest,
): ManualTransferSplit {
  // Validates the whole request first: archived accounts, currencies, amount.
  buildLegsFor(db, request);
  return splitFor(request, listOverflowAccounts(db));
}

// What becomes of the surplus of a split, following the user's decision.
function planSurplus(
  db: AppDatabase,
  request: TransferRequest,
  split: ManualTransferSplit,
  decision: SurplusDecision | null,
  accounts: readonly OverflowAccount[],
): { part: TransferRequest | null; unplaced: number } {
  if (split.surplus === 0) return { part: null, unplaced: 0 };
  if (decision === null) throw new SurplusDecisionRequiredError(split);
  if (decision.kind === "room-only") {
    return { part: null, unplaced: split.surplus };
  }
  getOpenAccount(db, decision.accountId);
  // The same room check applies to the account the user chose.
  const second = splitManualTransfer(split.surplus, decision.accountId, accounts);
  return {
    part:
      second.deposited > 0
        ? {
            ...request,
            destinationId: decision.accountId,
            amount: second.deposited,
          }
        : null,
    unplaced: second.surplus,
  };
}

/**
 * Records a transfer entered by hand. When the destination cannot take the
 * whole amount the decision of the user is applied, and everything is recorded
 * in one database transaction (DOMAIN, deposit ceiling and overflow).
 */
export function recordManualTransfer(
  db: AppDatabase,
  request: TransferRequest,
  decision: SurplusDecision | null,
): ManualTransferResult {
  buildLegsFor(db, request);
  const accounts = listOverflowAccounts(db);
  const split = splitFor(request, accounts);
  const surplus = planSurplus(db, request, split, decision, accounts);

  const parts: TransferRequest[] = [];
  if (split.deposited > 0) {
    parts.push({ ...request, amount: split.deposited });
  }
  if (surplus.part !== null) parts.push(surplus.part);
  if (parts.length === 0) {
    throw new TransactionValidationError(
      "amount",
      "Nothing fits under the ceilings: no transfer was recorded",
      messageRef("transferNothingFits"),
    );
  }

  const legs = parts.map((part) => buildLegsFor(db, part));
  return db.transaction((tx) => ({
    transfers: legs.map((pair) => insertTransferLegs(tx, pair)),
    unplaced: surplus.unplaced,
  }));
}

/**
 * Read-only: the warning shown with an income that exceeds the ceiling. When
 * an existing transaction is being edited, it is left out of the balance the
 * new amount is checked against.
 */
export function previewCeilingWarning(
  db: AppDatabase,
  input: TransactionInput,
  { replacingTransactionId }: { replacingTransactionId?: number } = {},
): CeilingWarning | null {
  const valid = validateTransactionInput(input);
  const account = getOpenAccount(db, valid.accountId);
  let balance = getAccountBalance(db, account.id);
  if (replacingTransactionId !== undefined) {
    const replaced = getTransaction(db, replacingTransactionId);
    // It only counts in this balance if it stays on the same account.
    if (replaced.accountId === account.id) balance -= replaced.amount;
  }
  return ceilingWarningFor(valid, { balance, ceiling: account.depositCeiling });
}

export function updateTransaction(
  db: AppDatabase,
  id: number,
  input: TransactionInput,
): Transaction {
  const current = getTransaction(db, id);
  // The two legs of a transfer stay consistent only if they change together:
  // the user deletes the transfer and enters it again.
  if (current.kind === "transfer") {
    throw new TransactionValidationError(
      "kind",
      "A transfer cannot be edited: delete it and enter it again",
      messageRef("transferNotEditable"),
    );
  }
  // Both ends must be open: moving a transaction out of an archived account
  // would take its balance away from zero (DOMAIN, invariant 12).
  getOpenAccount(db, current.accountId);
  const valid = validateTransactionInput(input);
  getOpenAccount(db, valid.accountId);
  assertCategoryChoice(db, valid.kind, valid.categoryId, current.categoryId);
  return db
    .update(transactions)
    .set(valid)
    .where(eq(transactions.id, id))
    .returning()
    .get();
}

/**
 * Categorizes from the to-categorize queue. A category does not move any
 * balance, so it is allowed on a transaction of an archived account. With
 * `rule`, the rule suggested by the user is recorded in the same operation,
 * so that either both happen or neither does.
 */
export function setTransactionCategory(
  db: AppDatabase,
  id: number,
  categoryId: number | null,
  { rule = null }: { rule?: { operator: RuleOperator; value: string } | null } = {},
): Transaction {
  const current = getTransaction(db, id);
  assertCategoryChoice(db, current.kind, categoryId, current.categoryId);
  if (rule === null) return writeCategory(db, id, categoryId);

  if (categoryId === null) {
    throw new Error("A rule needs a category to assign");
  }
  const value = validateRuleValue(rule.value);
  return db.transaction((tx) => {
    const updated = writeCategory(tx, id, categoryId);
    insertRule(tx, {
      operator: rule.operator,
      value,
      accountId: null,
      categoryId,
    });
    return updated;
  });
}

function writeCategory(
  writer: Pick<AppDatabase, "update">,
  id: number,
  categoryId: number | null,
): Transaction {
  return writer
    .update(transactions)
    .set({ categoryId })
    .where(eq(transactions.id, id))
    .returning()
    .get();
}

/** Entered transactions that still need a category: transfers never do. */
export function listUncategorizedTransactions(db: AppDatabase): Transaction[] {
  return db
    .select()
    .from(transactions)
    .where(and(isNull(transactions.categoryId), ne(transactions.kind, "transfer")))
    .orderBy(asc(transactions.date), asc(transactions.id))
    .all();
}

/** Deleting one leg of a transfer deletes the other (DOMAIN, invariant 3). */
export function deleteTransaction(db: AppDatabase, id: number): void {
  const transaction = getTransaction(db, id);
  // An archived account keeps a zero balance (DOMAIN, invariant 12): none of
  // its transactions can disappear, nor the transfer they belong to.
  getOpenAccount(db, transaction.accountId);
  const counterpartId = transaction.transferCounterpartId;
  if (counterpartId !== null) {
    getOpenAccount(db, getTransaction(db, counterpartId).accountId);
  }
  const ids =
    counterpartId === null ? [transaction.id] : [transaction.id, counterpartId];
  // One statement: the legs reference each other, and SQLite checks the
  // foreign key at the end of the statement.
  db.delete(transactions).where(inArray(transactions.id, ids)).run();
}

export function listTransactions(db: AppDatabase): Transaction[] {
  // SQLite gives no order guarantee without ORDER BY.
  return db
    .select()
    .from(transactions)
    .orderBy(asc(transactions.date), asc(transactions.id))
    .all();
}
