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

/**
 * The accounts visited along the overflow chain from `startId`, in order. The
 * chain comes from user input, so the walk stops before an account is visited
 * twice and reports it as `hasLoop`. Empty when `startId` is unknown.
 *
 * When `hasLoop` is true, `accounts` holds only the accounts visited up to
 * (excluding) the repeated one, not the full chain. Callers that only need
 * membership (assertOverflowTargetAllowed) rely on that: every account on the
 * path is still listed, and the walk is guaranteed to terminate.
 */
function walkOverflowChain<T extends Pick<OverflowAccount, "id" | "overflowAccountId">>(
  startId: number,
  byId: ReadonlyMap<number, T>,
): { accounts: T[]; hasLoop: boolean } {
  const accounts: T[] = [];
  const visited = new Set<number>();
  let current = byId.get(startId);
  while (current !== undefined) {
    if (visited.has(current.id)) return { accounts, hasLoop: true };
    visited.add(current.id);
    accounts.push(current);
    current =
      current.overflowAccountId === null
        ? undefined
        : byId.get(current.overflowAccountId);
  }
  return { accounts, hasLoop: false };
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
  // The whole chain is walked even once everything is placed: a loop further
  // down is a corrupted configuration and must be reported, not hidden.
  const { accounts: chain, hasLoop } = walkOverflowChain(destinationId, byId);
  if (hasLoop) return { status: "invalid", reason: "cycle" };

  const placements: Placement[] = [];
  let remaining = amount;
  for (const current of chain) {
    const placed = Math.min(remaining, depositRoom(current));
    if (placed > 0) {
      placements.push({ accountId: current.id, amount: placed });
      remaining -= placed;
    }
  }

  return { status: "ok", placements, unplaced: remaining };
}

/** The accounts that may take a surplus: active savings accounts (ADR-013). */
export function overflowTargetsOf<T extends { kind: string; archived: boolean }>(
  accounts: readonly T[],
): T[] {
  return accounts.filter(({ kind, archived }) => kind === SAVINGS_KIND && !archived);
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
  // account: the walk stops on it instead of reporting it.
  const { accounts: chain } = walkOverflowChain(targetId, byId);
  if (chain.some(({ id }) => id === candidate.id)) {
    throw new AccountValidationError(
      "overflowAccountId",
      "The overflow chain would loop back to this account",
      messageRef("overflowChainLoop"),
    );
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
  const { accounts, hasLoop } = walkOverflowChain(startId, byId);
  if (hasLoop) return null;
  return accounts.at(-1)?.id ?? null;
}
