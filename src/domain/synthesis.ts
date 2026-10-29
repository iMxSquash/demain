/**
 * Monthly synthesis: net of the month, savings of the month, end-of-month
 * balances and the cumulative figures. Pure functions: no clock, database or
 * network, the data and the last month come in as inputs. See DOMAIN, monthly
 * synthesis.
 */

import type { AccountKind } from "./account";
import { convertAmount, type ExchangeRate } from "./exchange-rate";
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
  /**
   * Currencies with a balance or a flow left out of the figures because no
   * rate applied, sorted.
   */
  unconvertedCurrencies: string[];
}

export interface SynthesisInput {
  accounts: readonly SynthesisAccount[];
  transactions: readonly SynthesisTransaction[];
  /** Currency of the totals. */
  referenceCurrency: string;
  /**
   * Rates used to bring other currencies into the reference currency. A
   * currency without an applicable rate is reported, not summed.
   */
  exchangeRates?: readonly ExchangeRate[];
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
  exchangeRates: readonly ExchangeRate[];
}

function isSavings(lookups: Lookups, accountId: number): boolean {
  return lookups.accountById.get(accountId)?.kind === "savings";
}

// A flow is valued with the rate in force on its own date. Null: its currency
// has no rate yet, or its account is unknown.
function inReferenceCurrency(
  lookups: Lookups,
  transaction: SynthesisTransaction,
): number | null {
  const currency = lookups.accountById.get(transaction.accountId)?.currency;
  return currency === undefined
    ? null
    : convertAmount(
        transaction.amount,
        currency,
        lookups.referenceCurrency,
        transaction.date,
        lookups.exchangeRates,
      );
}

interface Flows {
  total: number;
  /** Currencies of the flows left out because no rate applied on their date. */
  unconvertedCurrencies: string[];
}

function sumConverted(
  lookups: Lookups,
  transactions: Iterable<SynthesisTransaction>,
): Flows {
  let total = 0;
  const unconverted = new Set<string>();
  for (const transaction of transactions) {
    const converted = inReferenceCurrency(lookups, transaction);
    if (converted !== null) {
      total += converted;
      continue;
    }
    const currency = lookups.accountById.get(transaction.accountId)?.currency;
    if (currency !== undefined) {
      unconverted.add(currency);
    }
  }
  return { total, unconvertedCurrencies: [...unconverted] };
}

function netOf(
  lookups: Lookups,
  inMonth: readonly SynthesisTransaction[],
): Flows {
  return sumConverted(
    lookups,
    inMonth.filter((transaction) => transaction.kind !== "transfer"),
  );
}

// Only the legs on a savings account count, and only when the other end is
// not a savings account: savings to savings moves nothing out of the pot. A
// leg whose counterpart is unknown is left out rather than guessed.
function savingsOf(
  lookups: Lookups,
  inMonth: readonly SynthesisTransaction[],
): Flows {
  return sumConverted(
    lookups,
    inMonth.filter((leg) => {
      if (leg.kind !== "transfer" || !isSavings(lookups, leg.accountId)) {
        return false;
      }
      const counterpart =
        leg.transferCounterpartId === null
          ? undefined
          : lookups.transactionById.get(leg.transferCounterpartId);
      return counterpart !== undefined && !isSavings(lookups, counterpart.accountId);
    }),
  );
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

// "YYYY-MM-31" is not always a real date, but it is after every day of the
// month and before the next one when compared as text, which is all a rate
// lookup does.
function endOfMonth(month: Month): string {
  return `${month}-31`;
}

// Balances are valued with the rate in force at the end of their month.
function totalsOf(
  balances: readonly AccountBalance[],
  input: SynthesisInput,
  month: Month,
) {
  let total = 0;
  const unconverted = new Set<string>();
  for (const entry of balances) {
    const converted = convertAmount(
      entry.balance,
      entry.currency,
      input.referenceCurrency,
      endOfMonth(month),
      input.exchangeRates ?? [],
    );
    if (converted === null) {
      unconverted.add(entry.currency);
    } else {
      total += converted;
    }
  }
  return { total, unconvertedCurrencies: [...unconverted].sort() };
}

function buildLookups(input: SynthesisInput): Lookups {
  return {
    accountById: new Map(input.accounts.map((account) => [account.id, account])),
    transactionById: new Map(
      input.transactions.map((transaction) => [transaction.id, transaction]),
    ),
    referenceCurrency: input.referenceCurrency,
    exchangeRates: input.exchangeRates ?? [],
  };
}

// Running balance of every account: seeded with its opening balance and moved
// by each month's transactions, so no month is recomputed from the start.
function seedBalances(
  accounts: readonly SynthesisAccount[],
): Map<number, number> {
  return new Map(accounts.map((account) => [account.id, account.openingBalance]));
}

// Balances of the accounts open in the month, with the total in the reference
// currency and the currencies left out of it.
function balanceFiguresAt(
  input: SynthesisInput,
  running: ReadonlyMap<number, number>,
  month: Month,
) {
  const balances = openBalances(input.accounts, running, month);
  return { balances, ...totalsOf(balances, input, month) };
}

// Moves the running balances by the transactions of one month, in place.
function applyToBalances(
  running: Map<number, number>,
  inMonth: readonly SynthesisTransaction[],
): void {
  for (const transaction of inMonth) {
    const balance = running.get(transaction.accountId) ?? 0;
    running.set(transaction.accountId, balance + transaction.amount);
  }
}

export function computeMonthlySynthesis(
  input: SynthesisInput,
): MonthlySynthesis[] {
  const start = firstMonth(input);
  if (start === null) return [];

  const lookups = buildLookups(input);
  const byMonth = groupByMonth(input.transactions);
  const running = seedBalances(input.accounts);

  const rows: MonthlySynthesis[] = [];
  let cumulativeNet = 0;
  let cumulativeSavings = 0;
  for (let month = start; month <= input.throughMonth; month = nextMonth(month)) {
    const inMonth = byMonth.get(month) ?? [];
    applyToBalances(running, inMonth);
    const net = netOf(lookups, inMonth);
    const savings = savingsOf(lookups, inMonth);
    cumulativeNet += net.total;
    cumulativeSavings += savings.total;
    const figures = balanceFiguresAt(input, running, month);
    rows.push({
      month,
      net: net.total,
      savings: savings.total,
      cumulativeSavings,
      cumulativeAccount: cumulativeNet - cumulativeSavings,
      ...figures,
      unconvertedCurrencies: [
        ...new Set([
          ...figures.unconvertedCurrencies,
          ...net.unconvertedCurrencies,
          ...savings.unconvertedCurrencies,
        ]),
      ].sort(),
    });
  }
  return rows;
}
