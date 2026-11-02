/**
 * Savings movements of an import, planned as transfers along the overflow
 * chain. Pure functions: no database, no clock. See DOMAIN, section Reading
 * any CSV file, and ADR-013 and ADR-016.
 */

import {
  routeAlongOverflowChain,
  type OverflowAccount,
  type Placement,
} from "./overflow";

/** A savings row of an import, seen from the account that receives the file. */
export interface SavingsMovement {
  /** Position in the rows of the file: the plan points back to it. */
  index: number;
  /** YYYY-MM-DD. */
  date: string;
  /**
   * Signed integer in minor units, as on the account that receives the file:
   * negative is a deposit to savings, positive a withdrawal from it.
   */
  amount: number;
  savingsAccountId: number;
}

export type SavingsTransfer =
  | {
      kind: "deposit";
      index: number;
      date: string;
      /** Part of the deposit received by each account of the chain. */
      placements: Placement[];
      /** Part that fits nowhere along the chain; also reported in `issues`. */
      unplaced: number;
    }
  | {
      kind: "withdrawal";
      index: number;
      date: string;
      accountId: number;
      /** Positive, in minor units. */
      amount: number;
    };

/** What the user has to look at: nothing is dropped without one of these. */
export type SavingsPlanIssue =
  | { kind: "savingsAmountInvalid"; index: number }
  | { kind: "savingsUnplaced"; index: number; amount: number }
  | { kind: "overflowChainCycle" };

export interface SavingsPlan {
  transfers: SavingsTransfer[];
  issues: SavingsPlanIssue[];
  /** The accounts once the transfers are applied: the starting point of the next plan. */
  accounts: OverflowAccount[];
}

// ISO dates sort as text; the sort is stable, so rows of one day keep the file order.
function compareDates(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function isValidAmount(amount: number): boolean {
  return Number.isSafeInteger(amount) && amount !== 0;
}

/**
 * Plans the movements in date order, each one from the balances left by the
 * previous one: a deposit fills the first account up to its ceiling and the
 * rest goes down the chain, and a withdrawal lowers the balance without any
 * check. The balances of the accounts given are not modified. A loop in the
 * chain spoils every deposit, so it plans nothing.
 */
export function planSavingsTransfers(
  movements: readonly SavingsMovement[],
  accounts: readonly OverflowAccount[],
): SavingsPlan {
  const running = accounts.map((account) => ({ ...account }));
  const transfers: SavingsTransfer[] = [];
  const issues: SavingsPlanIssue[] = [];

  const chronological = [...movements].sort((a, b) => compareDates(a.date, b.date));

  // Every invalid amount is reported, even when a loop later stops the placement.
  const valid = chronological.filter((movement) => {
    if (isValidAmount(movement.amount)) return true;
    issues.push({ kind: "savingsAmountInvalid", index: movement.index });
    return false;
  });

  for (const { index, date, amount, savingsAccountId } of valid) {
    if (amount > 0) {
      const account = running.find(({ id }) => id === savingsAccountId);
      if (account === undefined) throw new Error(`Unknown account ${savingsAccountId}`);
      account.balance -= amount;
      transfers.push({ kind: "withdrawal", index, date, accountId: account.id, amount });
      continue;
    }

    const routing = routeAlongOverflowChain(-amount, savingsAccountId, running);
    // The chain does not depend on the balances: one loop spoils every deposit.
    if (routing.status !== "ok") {
      return {
        transfers: [],
        issues: [...issues, { kind: "overflowChainCycle" }],
        accounts: accounts.map((account) => ({ ...account })),
      };
    }
    for (const placement of routing.placements) {
      const account = running.find(({ id }) => id === placement.accountId);
      if (account !== undefined) account.balance += placement.amount;
    }
    transfers.push({
      kind: "deposit",
      index,
      date,
      placements: routing.placements,
      unplaced: routing.unplaced,
    });
    if (routing.unplaced > 0) {
      issues.push({ kind: "savingsUnplaced", index, amount: routing.unplaced });
    }
  }
  return { transfers, issues, accounts: running };
}

export interface DatedFile {
  /** Date of the first movement of the file; null when it has none. */
  firstDate: string | null;
}

/**
 * Files in the order they are recorded: by first date, a file with no date
 * last, files that tie keeping the order they were given in.
 */
export function orderFilesByDate<T extends DatedFile>(files: readonly T[]): T[] {
  return [...files].sort((a, b) => {
    if (a.firstDate === null || b.firstDate === null) {
      return Number(a.firstDate === null) - Number(b.firstDate === null);
    }
    return compareDates(a.firstDate, b.firstDate);
  });
}

/** Plans each file in date order, on the balances the previous file leaves. */
export function planFilesInDateOrder<
  T extends DatedFile & { movements: readonly SavingsMovement[] },
>(
  files: readonly T[],
  accounts: readonly OverflowAccount[],
): { file: T; plan: SavingsPlan }[] {
  let current = accounts;
  return orderFilesByDate(files).map((file) => {
    const plan = planSavingsTransfers(file.movements, current);
    current = plan.accounts;
    return { file, plan };
  });
}
