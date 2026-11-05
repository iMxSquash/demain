/**
 * Deposit ceilings and overflow chains. Pure functions: no database, no clock.
 * See DOMAIN, section Deposit ceiling and overflow, and ADR-013.
 */

import { AccountValidationError, type AccountKind } from "./account";
import { messageRef } from "./message";

const SAVINGS_KIND: AccountKind = "savings";

export interface OverflowAccount {
  id: number;
  currency: string;
  archived: boolean;
  /** Signed integer in minor units. */
  balance: number;
  /** Maximum balance reachable through deposits, in minor units. */
  ceiling: number | null;
  overflowAccountId: number | null;
}

/** What the validation of a chain needs to know about an account. */
export type OverflowLink = Pick<
  OverflowAccount,
  "id" | "currency" | "archived" | "overflowAccountId"
> & { kind: string };

export interface Placement {
  accountId: number;
  amount: number;
}

export type OverflowRouting =
  | {
      status: "ok";
      placements: Placement[];
      /** Part that fits nowhere along the chain: it stays in the source account. */
      unplaced: number;
    }
  | { status: "invalid"; reason: "cycle" };

/**
 * Room left under the ceiling, never below zero. Interest may leave the
 * balance above the ceiling, which simply means no room. Infinity: no ceiling.
 */
export function depositRoom(
  account: Pick<OverflowAccount, "balance" | "ceiling">,
): number {
  if (account.ceiling === null) return Number.POSITIVE_INFINITY;
  return Math.max(0, account.ceiling - account.balance);
}

export function routeAlongOverflowChain(
  amount: number,
  destinationId: number,
  accounts: readonly OverflowAccount[],
): OverflowRouting {
  if (!Number.isSafeInteger(amount) || amount < 0) {
    throw new RangeError("The amount to route must be a non-negative integer");
  }
  const byId = new Map(accounts.map((account) => [account.id, account]));
  if (!byId.has(destinationId)) {
    throw new Error(`Unknown account ${destinationId}`);
  }
  const placements: Placement[] = [];
  // The chain comes from user input: stop at the first account seen twice.
  const visited = new Set<number>();
  let remaining = amount;
  let current = byId.get(destinationId);

  // The walk continues once everything is placed: a loop further down the
  // chain is a corrupted configuration and must be reported, not hidden.
  while (current !== undefined) {
    if (visited.has(current.id)) {
      return { status: "invalid", reason: "cycle" };
    }
    visited.add(current.id);
    const placed = Math.min(remaining, depositRoom(current));
    if (placed > 0) {
      placements.push({ accountId: current.id, amount: placed });
      remaining -= placed;
    }
    current =
      current.overflowAccountId === null
        ? undefined
        : byId.get(current.overflowAccountId);
  }

  return { status: "ok", placements, unplaced: remaining };
}

/**
 * Refuses an overflow target that would create a cycle, cross currencies,
 * point to an unknown or archived account, or is not a savings account. Runs on every save, since the
 * configuration comes from user input.
 */
export function assertOverflowTargetAllowed(
  // A new account has no id yet and nobody points to it, so it cannot be in a loop.
  candidate: { id: number | null; currency: string },
  targetId: number,
  accounts: readonly OverflowLink[],
): void {
  const byId = new Map(accounts.map((account) => [account.id, account]));
  const target = byId.get(targetId);

  if (target === undefined) {
    throw new AccountValidationError(
      "overflowAccountId",
      "The overflow account does not exist",
      messageRef("overflowAccountMissing"),
    );
  }
  if (target.archived) {
    throw new AccountValidationError(
      "overflowAccountId",
      "The overflow account is archived",
      messageRef("overflowAccountArchived"),
    );
  }
  if (target.kind !== SAVINGS_KIND) {
    throw new AccountValidationError(
      "overflowAccountId",
      "The overflow account must be a savings account",
      messageRef("overflowAccountNotSavings"),
    );
  }
  if (target.currency !== candidate.currency) {
    throw new AccountValidationError(
      "overflowAccountId",
      "The overflow account must have the same currency",
      messageRef("overflowAccountCurrencyMismatch"),
    );
  }

  // Stored data may already contain a loop that does not involve this
  // account: the visited set guarantees the walk ends.
  const visited = new Set<number>();
  let current: OverflowLink | undefined = target;
  while (current !== undefined && !visited.has(current.id)) {
    if (current.id === candidate.id) {
      throw new AccountValidationError(
        "overflowAccountId",
        "The overflow chain would loop back to this account",
        messageRef("overflowChainLoop"),
      );
    }
    visited.add(current.id);
    current =
      current.overflowAccountId === null
        ? undefined
        : byId.get(current.overflowAccountId);
  }
}

/**
 * The last account of the chain that starts at `startId`: the one whose
 * surplus has nowhere to go. Null when the chain loops or starts nowhere.
 */
export function overflowChainTail(
  startId: number,
  byId: ReadonlyMap<number, Pick<OverflowAccount, "id" | "overflowAccountId">>,
): number | null {
  const visited = new Set<number>();
  let current = byId.get(startId);
  let tail: number | null = null;
  while (current !== undefined) {
    if (visited.has(current.id)) return null;
    visited.add(current.id);
    tail = current.id;
    current =
      current.overflowAccountId === null
        ? undefined
        : byId.get(current.overflowAccountId);
  }
  return tail;
}
