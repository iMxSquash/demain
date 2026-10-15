/**
 * Transaction rules. Pure functions: no database, no clock. See DOMAIN,
 * entity Transaction and invariants 1 and 3.
 */

import { isCalendarDate } from "./account";
import { depositRoom, type OverflowAccount } from "./overflow";

/** Kinds a user can enter directly: a transfer is created as a linked pair. */
export const ENTERED_TRANSACTION_KINDS = [
  "expense",
  "income",
  "interest",
] as const;

export type EnteredTransactionKind = (typeof ENTERED_TRANSACTION_KINDS)[number];

export const PAYMENT_MODES = ["card", "transfer", "direct_debit"] as const;

export type PaymentMode = (typeof PAYMENT_MODES)[number];

function isPaymentMode(value: string): value is PaymentMode {
  return (PAYMENT_MODES as readonly string[]).includes(value);
}

export interface TransactionInput {
  accountId: number;
  /** Calendar date, YYYY-MM-DD. */
  date: string;
  /** Signed integer in minor units: negative leaves the account. */
  amount: number;
  kind: EnteredTransactionKind;
  label: string;
  /** Optional user note. */
  description?: string | null;
  paymentMode?: string | null;
  /** Null or absent: the transaction waits in the to-categorize queue. */
  categoryId?: number | null;
}

export interface ValidTransactionInput extends TransactionInput {
  description: string | null;
  paymentMode: PaymentMode | null;
  categoryId: number | null;
}

export type TransactionField =
  | "accountId"
  | "amount"
  | "categoryId"
  | "date"
  | "description"
  | "kind"
  | "label"
  | "paymentMode";

export class TransactionValidationError extends Error {
  constructor(
    readonly field: TransactionField,
    message: string,
  ) {
    super(message);
    this.name = "TransactionValidationError";
  }
}

function assertNonZeroMinorUnits(amount: number): void {
  if (!Number.isSafeInteger(amount) || amount === 0) {
    throw new TransactionValidationError(
      "amount",
      "The amount must be a non-zero integer in minor units",
    );
  }
}

function assertCalendarDate(date: string): void {
  if (!isCalendarDate(date)) {
    throw new TransactionValidationError(
      "date",
      `Invalid date "${date}", expected YYYY-MM-DD`,
    );
  }
}

function normalizeLabel(label: string): string {
  const trimmed = label.trim();
  if (trimmed.length === 0) {
    throw new TransactionValidationError("label", "The label is required");
  }
  return trimmed;
}

function normalizePaymentMode(value: string | null | undefined): PaymentMode | null {
  if (value === null || value === undefined) return null;
  if (!isPaymentMode(value)) {
    throw new TransactionValidationError(
      "paymentMode",
      `Unknown payment mode "${value}"`,
    );
  }
  return value;
}

export function validateTransactionInput(
  input: TransactionInput,
): ValidTransactionInput {
  assertNonZeroMinorUnits(input.amount);
  const isExpense = input.kind === "expense";
  if (isExpense !== input.amount < 0) {
    throw new TransactionValidationError(
      "amount",
      isExpense
        ? "An expense must have a negative amount"
        : `An ${input.kind} must have a positive amount`,
    );
  }
  assertCalendarDate(input.date);
  return {
    ...input,
    label: normalizeLabel(input.label),
    description: input.description?.trim() || null,
    paymentMode: normalizePaymentMode(input.paymentMode),
    categoryId: input.categoryId ?? null,
  };
}

/** What a transfer needs to know about one of its two accounts. */
export interface TransferEndpoint {
  id: number;
  currency: string;
  archived: boolean;
}

export interface TransferInput {
  source: TransferEndpoint;
  destination: TransferEndpoint;
  /** Positive integer in minor units, the amount leaving the source. */
  amount: number;
  /** Calendar date, YYYY-MM-DD. */
  date: string;
  label: string;
}

export interface TransferLeg {
  accountId: number;
  date: string;
  amount: number;
  kind: "transfer";
  label: string;
}

function assertTransferEndpoints(
  source: TransferEndpoint,
  destination: TransferEndpoint,
): void {
  if (source.id === destination.id) {
    throw new TransactionValidationError(
      "accountId",
      "A transfer needs two different accounts",
    );
  }
  if (source.archived || destination.archived) {
    throw new TransactionValidationError(
      "accountId",
      "No transaction can be entered on an archived account",
    );
  }
  if (source.currency !== destination.currency) {
    throw new TransactionValidationError(
      "accountId",
      "A transfer cannot cross currencies",
    );
  }
}

/** A transfer is exactly two transactions of opposite sign (DOMAIN, invariant 3). */
export function buildTransferLegs(
  input: TransferInput,
): [outgoing: TransferLeg, incoming: TransferLeg] {
  assertTransferEndpoints(input.source, input.destination);
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0) {
    throw new TransactionValidationError(
      "amount",
      "The amount of a transfer must be a positive integer in minor units",
    );
  }
  assertCalendarDate(input.date);
  const { date, amount } = input;
  const label = normalizeLabel(input.label);
  return [
    { accountId: input.source.id, date, amount: -amount, kind: "transfer", label },
    { accountId: input.destination.id, date, amount, kind: "transfer", label },
  ];
}

export interface ManualTransferSplit {
  /** Part that fits under the ceiling of the destination. */
  deposited: number;
  /** Part that does not fit: the user decides what to do with it. */
  surplus: number;
  /** Overflow account to preselect, only when there is a surplus to place. */
  suggestedOverflowAccountId: number | null;
}

/**
 * Split shown before recording a transfer entered by hand. Only the
 * destination is checked: when the user sends the surplus to an account, the
 * same function is applied to that account (DOMAIN, deposit ceiling and overflow).
 */
export function splitManualTransfer(
  amount: number,
  destinationId: number,
  accounts: readonly OverflowAccount[],
): ManualTransferSplit {
  const destination = accounts.find((account) => account.id === destinationId);
  if (destination === undefined) {
    throw new Error(`Unknown account ${destinationId}`);
  }
  const deposited = Math.min(amount, depositRoom(destination));
  const surplus = amount - deposited;
  return {
    deposited,
    surplus,
    suggestedOverflowAccountId:
      surplus > 0 ? destination.overflowAccountId : null,
  };
}

export interface CeilingWarning {
  /** Part of the income that goes above the ceiling, in minor units. */
  excess: number;
}

/**
 * An income above a ceiling is accepted and not routed, since the money has
 * really arrived there: the user is only warned. Interest is always accepted
 * silently (DOMAIN, deposit ceiling and overflow).
 */
export function ceilingWarningFor(
  transaction: TransactionInput,
  account: Pick<OverflowAccount, "balance" | "ceiling">,
): CeilingWarning | null {
  if (transaction.kind !== "income") return null;
  const excess = transaction.amount - depositRoom(account);
  return excess > 0 ? { excess } : null;
}
