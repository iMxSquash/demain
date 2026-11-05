/**
 * Links a file under review to the balance assertions of its period: what the
 * balance of each account would be once the file is recorded, against the real
 * balance the user wrote down. Pure functions: no database, no clock. The
 * movements are the ones the review plans, so that the figures agree with what
 * the import records. See DOMAIN, section Importing files.
 */

import {
  computeUnexplainedGap,
  gapDirection,
  type AssertedAccount,
  type AssertionMovement,
  type AssertionSnapshot,
  type GapDirection,
} from "./balance-assertion";
import { readImportDraft, signedAmountForType } from "./import-draft";
import { lastMovementDate } from "./batch-balance";
import { isFileRecorded, type FilePlan, type ReviewedFile } from "./import-review";
import { compareDates, firstMovementDate } from "./import-savings";

/** What the movements of a file need to know about where it is imported. */
export interface FileContext {
  /** The account that receives the file. */
  accountId: number;
  currency: string;
}

/** Days covered by a file, bounds included, YYYY-MM-DD. */
export interface FilePeriod {
  from: string;
  to: string;
}

/**
 * The movements the file records, as the account balances see them: one per
 * new row, and both sides of every part of a savings row, as `plan` splits it.
 * The rows the account already holds, the rows that cannot be read, the part of
 * a deposit that fits nowhere and a file that is cancelled or failed give none.
 */
export function fileMovements(
  file: ReviewedFile,
  plan: FilePlan,
  { accountId, currency }: FileContext,
): AssertionMovement[] {
  if (!isFileRecorded(file)) return [];
  return file.rows.flatMap((row, index): AssertionMovement[] => {
    if (row.isDuplicate) return [];
    const reading = readImportDraft(row.draft, currency);
    if (!reading.ok) return [];
    const { date, amount } = reading.row;
    if (row.details.type !== "savings") {
      return [{ accountId, date, amount: signedAmountForType(row.details.type, amount) }];
    }
    return (plan.splits.get(index) ?? []).flatMap(({ direction, accountId: otherId, amount: part }) => {
      if (direction === "unplaced" || otherId === null) return [];
      const sign = direction === "to" ? -1 : 1;
      return [
        { accountId, date, amount: sign * part },
        { accountId: otherId, date, amount: -sign * part },
      ];
    });
  });
}

/**
 * The days the file covers: from its first to its last readable row. The rows
 * the account already holds count, since the file still speaks for their days.
 * Null when no row can be read, and for a cancelled or failed file.
 */
export function filePeriod(file: ReviewedFile, currency: string): FilePeriod | null {
  if (!isFileRecorded(file)) return null;
  const dates = file.rows.flatMap(({ draft }) => {
    const reading = readImportDraft(draft, currency);
    return reading.ok ? [reading.row.date] : [];
  });
  const from = firstMovementDate(dates);
  const to = lastMovementDate(dates);
  return from === null || to === null ? null : { from, to };
}

/** What is stored when the file is reviewed. */
export interface AssertionLinkSnapshot {
  /** Active accounts only: the assertions of any other account are ignored. */
  accounts: readonly AssertedAccount[];
  /** Every transaction already recorded on those accounts. */
  transactions: readonly AssertionMovement[];
  assertions: readonly AssertionSnapshot[];
}

export interface AssertionLinkFile {
  /** The account that receives the file. */
  accountId: number;
  period: FilePeriod | null;
  /** From `fileMovements`: the ones of the rows the account already holds are not in it. */
  movements: readonly AssertionMovement[];
}

export interface AssertionLink {
  assertionId: number;
  date: string;
  realBalance: number;
  /** Opening balance plus every movement up to the date, those of the file included. */
  computedBalance: number;
  /** Computed minus real: positive when Demain holds more than the bank. Zero tolerance. */
  gap: number;
  direction: GapDirection;
}

export interface AccountAssertionLinks {
  accountId: number;
  /** By date. */
  links: AssertionLink[];
}

export interface AssertionLinks {
  /** By account id; only the accounts with an assertion in the period. */
  accounts: AccountAssertionLinks[];
  checked: number;
  /** How many of the checked assertions have no gap. */
  matching: number;
}

/**
 * Compares the assertions that fall in the period of the file with the
 * balances the file leaves. Only the accounts the file moves are checked, plus
 * the one that receives it, whatever the file holds.
 */
export function linkAssertions(
  file: AssertionLinkFile,
  { accounts, transactions, assertions }: AssertionLinkSnapshot,
): AssertionLinks {
  const { period } = file;
  if (period === null) return { accounts: [], checked: 0, matching: 0 };

  const touched = new Set([file.accountId, ...file.movements.map(({ accountId }) => accountId)]);
  const accountsById = new Map(accounts.map((account) => [account.id, account]));
  const inScope = assertions
    .filter(
      ({ accountId, date }) =>
        touched.has(accountId) &&
        accountsById.has(accountId) &&
        date >= period.from &&
        date <= period.to,
    )
    .toSorted((a, b) => compareDates(a.date, b.date) || a.id - b.id);
  const movementsByAccount = Map.groupBy(
    [...transactions, ...file.movements].filter(({ accountId }) => touched.has(accountId)),
    ({ accountId }) => accountId,
  );

  const links = new Map<number, AssertionLink[]>();
  for (const assertion of inScope) {
    const account = accountsById.get(assertion.accountId)!;
    const { computedBalance, gap } = computeUnexplainedGap(
      account,
      movementsByAccount.get(account.id) ?? [],
      assertion,
    );
    const accountLinks = links.get(account.id) ?? [];
    accountLinks.push({
      assertionId: assertion.id,
      date: assertion.date,
      realBalance: assertion.amount,
      computedBalance,
      gap,
      direction: gapDirection(computedBalance, assertion.amount),
    });
    links.set(account.id, accountLinks);
  }

  const byAccount = [...links].toSorted(([a], [b]) => a - b).map(
    ([accountId, accountLinks]): AccountAssertionLinks => ({ accountId, links: accountLinks }),
  );
  const all = byAccount.flatMap(({ links: accountLinks }) => accountLinks);
  return {
    accounts: byAccount,
    checked: all.length,
    matching: all.filter(({ gap }) => gap === 0).length,
  };
}
