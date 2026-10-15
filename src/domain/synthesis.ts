/**
 * Monthly synthesis: net of the month, savings of the month, end-of-month
 * balances and the cumulative figures. Pure functions: no clock, database or
 * network, the data and the last month come in as inputs. See DOMAIN, monthly
 * synthesis.
 */

import type { AccountKind } from "./account";
import type { EnteredTransactionKind } from "./transaction";

/** A calendar month as "YYYY-MM". */
export type Month = string;

export interface SynthesisAccount {
  id: number;
  kind: AccountKind;
  currency: string;
  /** Calendar date, YYYY-MM-DD. */
  openingDate: string;
  /** Signed integer in minor units. */
  openingBalance: number;
}

export interface SynthesisTransaction {
  id: number;
  accountId: number;
  /** Calendar date, YYYY-MM-DD. */
  date: string;
  /** Signed integer in minor units: negative leaves the account. */
  amount: number;
  kind: EnteredTransactionKind | "transfer";
  /** The other leg of a transfer, null otherwise. */
  transferCounterpartId: number | null;
}

export interface AccountBalance {
  accountId: number;
  /** Currency of the account, which is the currency of `balance`. */
  currency: string;
  balance: number;
}

export interface MonthlySynthesis {
  month: Month;
  /** Income and interest minus expenses, transfers excluded. */
  net: number;
  /** Transfers from non savings accounts into savings, minus transfers back out. */
  savings: number;
  /** Sum of the savings of the month since the first month of the series. */
  cumulativeSavings: number;
  /**
   * Sum of the net of the month since the start, minus the cumulative savings:
   * the change of the checking account, assuming every flow goes through it.
   */
  cumulativeAccount: number;
  /** Balance of each account open at the end of the month. */
  balances: AccountBalance[];
  /** Sum of the balances in the reference currency. */
  total: number;
  /** Currencies of open accounts that are left out of the totals, sorted. */
  unconvertedCurrencies: string[];
}

export interface SynthesisInput {
  accounts: readonly SynthesisAccount[];
  transactions: readonly SynthesisTransaction[];
  /** Currency of the totals: other currencies are reported, not summed. */
  referenceCurrency: string;
  /** Last month of the series, inclusive. */
  throughMonth: Month;
}

const MONTH_LENGTH = "YYYY-MM".length;

/** The month of a "YYYY-MM-DD" date, or of an ISO timestamp. */
export function monthOf(date: string): Month {
  return date.slice(0, MONTH_LENGTH);
}

function nextMonth(month: Month): Month {
  // Date rolls December over to January of the next year.
  const [year = 0, number = 1] = month.split("-").map(Number);
  return new Date(Date.UTC(year, number, 1)).toISOString().slice(0, MONTH_LENGTH);
}

// The series starts at the oldest month of an account opening or a transaction.
function firstMonth(input: SynthesisInput): Month | null {
  const months = [
    ...input.accounts.map((account) => monthOf(account.openingDate)),
    ...input.transactions.map((transaction) => monthOf(transaction.date)),
  ];
  // "YYYY-MM" strings sort chronologically.
  return months.length === 0 ? null : months.reduce((a, b) => (a < b ? a : b));
}

function groupByMonth(
  transactions: readonly SynthesisTransaction[],
): Map<Month, SynthesisTransaction[]> {
  const byMonth = new Map<Month, SynthesisTransaction[]>();
  for (const transaction of transactions) {
    const month = monthOf(transaction.date);
    const bucket = byMonth.get(month) ?? [];
    bucket.push(transaction);
    byMonth.set(month, bucket);
  }
  return byMonth;
}

interface Lookups {
  accountById: ReadonlyMap<number, SynthesisAccount>;
  transactionById: ReadonlyMap<number, SynthesisTransaction>;
  referenceCurrency: string;
}

function isSavings(lookups: Lookups, accountId: number): boolean {
  return lookups.accountById.get(accountId)?.kind === "savings";
}

function isInReferenceCurrency(lookups: Lookups, accountId: number): boolean {
  return (
    lookups.accountById.get(accountId)?.currency === lookups.referenceCurrency
  );
}

function netOf(lookups: Lookups, inMonth: readonly SynthesisTransaction[]) {
  return inMonth
    .filter(
      (transaction) =>
        transaction.kind !== "transfer" &&
        isInReferenceCurrency(lookups, transaction.accountId),
    )
    .reduce((total, transaction) => total + transaction.amount, 0);
}

// Only the legs on a savings account count, and only when the other end is
// not a savings account: savings to savings moves nothing out of the pot. A
// leg whose counterpart is unknown is left out rather than guessed.
function savingsOf(lookups: Lookups, inMonth: readonly SynthesisTransaction[]) {
  return inMonth.reduce((total, leg) => {
    if (
      leg.kind !== "transfer" ||
      !isSavings(lookups, leg.accountId) ||
      !isInReferenceCurrency(lookups, leg.accountId)
    ) {
      return total;
    }
    const counterpart =
      leg.transferCounterpartId === null
        ? undefined
        : lookups.transactionById.get(leg.transferCounterpartId);
    if (counterpart === undefined || isSavings(lookups, counterpart.accountId)) {
      return total;
    }
    return total + leg.amount;
  }, 0);
}

// An account counts from the month of its opening date.
function openBalances(
  accounts: readonly SynthesisAccount[],
  running: ReadonlyMap<number, number>,
  month: Month,
): AccountBalance[] {
  return accounts
    .filter((account) => monthOf(account.openingDate) <= month)
    .map((account) => ({
      accountId: account.id,
      currency: account.currency,
      balance: running.get(account.id) ?? account.openingBalance,
    }));
}

function totalsOf(balances: readonly AccountBalance[], referenceCurrency: string) {
  const inReference = balances.filter(
    (entry) => entry.currency === referenceCurrency,
  );
  const others = balances
    .map((entry) => entry.currency)
    .filter((currency) => currency !== referenceCurrency);
  return {
    total: inReference.reduce((sum, entry) => sum + entry.balance, 0),
    unconvertedCurrencies: [...new Set(others)].sort(),
  };
}

export function computeMonthlySynthesis(
  input: SynthesisInput,
): MonthlySynthesis[] {
  const start = firstMonth(input);
  if (start === null) return [];

  const lookups: Lookups = {
    accountById: new Map(input.accounts.map((account) => [account.id, account])),
    transactionById: new Map(
      input.transactions.map((transaction) => [transaction.id, transaction]),
    ),
    referenceCurrency: input.referenceCurrency,
  };
  const byMonth = groupByMonth(input.transactions);
  // Running balance of every account: seeded with its opening balance and moved
  // by each month's transactions, so no month is recomputed from the start.
  const running = new Map(
    input.accounts.map((account) => [account.id, account.openingBalance]),
  );

  const rows: MonthlySynthesis[] = [];
  let cumulativeNet = 0;
  let cumulativeSavings = 0;
  for (let month = start; month <= input.throughMonth; month = nextMonth(month)) {
    const inMonth = byMonth.get(month) ?? [];
    for (const transaction of inMonth) {
      const balance = running.get(transaction.accountId) ?? 0;
      running.set(transaction.accountId, balance + transaction.amount);
    }
    const net = netOf(lookups, inMonth);
    const savings = savingsOf(lookups, inMonth);
    cumulativeNet += net;
    cumulativeSavings += savings;
    const balances = openBalances(input.accounts, running, month);
    rows.push({
      month,
      net,
      savings,
      cumulativeSavings,
      cumulativeAccount: cumulativeNet - cumulativeSavings,
      balances,
      ...totalsOf(balances, input.referenceCurrency),
    });
  }
  return rows;
}
