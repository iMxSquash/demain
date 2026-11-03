/**
 * What the review asks when a savings row does not fit under the ceilings of
 * its chain. Pure functions: no database, no clock. See DOMAIN, section
 * Deposit ceiling and overflow, and ADR-013.
 */

import type { OverflowAccount } from "./overflow";

/** The part of one savings row that fits nowhere, and the account at the end of its chain. */
export interface OverflowShortfall {
  /** Position of the row in its file. */
  index: number;
  /** The account with a ceiling and no overflow account that could not take it. */
  accountId: number;
  /** Positive, in minor units. */
  amount: number;
}

/** One question for the user: which account takes what `accountId` cannot hold. */
export interface OverflowDemand {
  accountId: number;
  /** Everything that does not fit in this account, over all the files. */
  amount: number;
  rows: number;
}

/** Groups the shortfalls of the files by account, in the order accounts first fall short. */
export function overflowDemands(
  shortfallsByFile: readonly (readonly OverflowShortfall[])[],
): OverflowDemand[] {
  const demands = new Map<number, OverflowDemand>();
  for (const { accountId, amount } of shortfallsByFile.flat()) {
    const known = demands.get(accountId) ?? { accountId, amount: 0, rows: 0 };
    demands.set(accountId, {
      accountId,
      amount: known.amount + amount,
      rows: known.rows + 1,
    });
  }
  return [...demands.values()];
}

/**
 * The accounts once the user's choice is recorded. `created` is an account the
 * user just made and the snapshot does not hold yet.
 */
export function withOverflowAccount(
  accounts: readonly OverflowAccount[],
  accountId: number,
  overflowAccountId: number,
  created?: OverflowAccount,
): OverflowAccount[] {
  const known =
    created === undefined || accounts.some(({ id }) => id === created.id)
      ? accounts
      : [...accounts, created];
  return known.map((account) =>
    account.id === accountId ? { ...account, overflowAccountId } : { ...account },
  );
}
