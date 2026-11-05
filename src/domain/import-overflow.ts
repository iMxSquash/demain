/**
 * What the review asks when a savings row does not fit under the ceilings of
 * its chain. Pure functions: no database, no clock. See DOMAIN, section
 * Deposit ceiling and overflow, and ADR-013.
 */

import { isSelectableSavingsAccount, type SavingsAccountChoice } from "./import-savings";
import type { AccountRef, OverflowAccount } from "./overflow";

/** The part of one savings row that fits nowhere, and the account at the end of its chain. */
export interface OverflowShortfall {
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

/** The account that will take the surplus: one that exists, or one to create with the import. */
export type OverflowTarget =
  | { kind: "existing"; id: number }
  | { kind: "new"; name: string };

/** A choice made in the review. It is only saved together with the file it lets through. */
export interface PendingOverflow {
  /** The account with a ceiling and no overflow account. */
  accountId: number;
  target: OverflowTarget;
}

/** The choices a file needs: those of the accounts where its own rows fall short. */
export function choicesForShortfalls(
  choices: readonly PendingOverflow[],
  shortfalls: readonly OverflowShortfall[],
): PendingOverflow[] {
  const shortAccountIds = new Set(shortfalls.map(({ accountId }) => accountId));
  return choices.filter(({ accountId }) => shortAccountIds.has(accountId));
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
 * The accounts once the user's choice is recorded. An account to create is
 * referred to by its name and added with the defaults the server gives it (see
 * `createOverflowCandidate`): a savings account in the currency of the account
 * that overflows, with no balance, no ceiling and no overflow account.
 */
export function withOverflowChoice(
  accounts: readonly OverflowAccount<AccountRef>[],
  { accountId, target }: PendingOverflow,
): OverflowAccount<AccountRef>[] {
  const overflowAccountId = target.kind === "existing" ? target.id : target.name;
  const currency = accounts.find(({ id }) => id === accountId)?.currency;
  const isToAdd =
    target.kind === "new" &&
    currency !== undefined &&
    !accounts.some(({ id }) => id === overflowAccountId);
  const known = isToAdd
    ? [
        ...accounts,
        {
          id: overflowAccountId,
          currency,
          archived: false,
          balance: 0,
          ceiling: null,
          overflowAccountId: null,
        },
      ]
    : accounts;
  return known.map((account) =>
    account.id === accountId ? { ...account, overflowAccountId } : { ...account },
  );
}

/**
 * The accounts the review offers to take the surplus of `demandAccountId`:
 * active savings accounts of its currency (ADR-013), other than the account
 * that overflows and the account that receives the file.
 */
export function overflowTargetChoices(
  accounts: readonly SavingsAccountChoice[],
  demandAccountId: number,
  receivingAccountId: number,
  currency: string,
): number[] {
  return accounts
    .filter(
      (candidate) =>
        candidate.id !== demandAccountId &&
        isSelectableSavingsAccount({ id: receivingAccountId, currency }, candidate),
    )
    .map(({ id }) => id);
}
