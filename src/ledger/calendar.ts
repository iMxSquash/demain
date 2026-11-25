import { addDays } from "../domain/calendar-date";
import { convertAmount } from "../domain/exchange-rate";
import {
  resolveOccurrences,
  type OccurrenceLink,
  type OccurrenceStatus,
  type ResolvedOccurrence,
} from "../domain/occurrence-resolution";
import {
  firstDayBelowZero,
  projectWithRouting,
  type DailyBalance,
  type PlannedTransferRouting,
} from "../domain/projection";
import type { DateRange } from "../domain/recurrence";
import { lastDayOfMonth } from "../domain/summary-assertions";
import type { AppDatabase } from "../storage/database";
import { listAccounts, type Account } from "./accounts";
import { listCategories } from "./categories";
import { listExchangeRates, type StoredExchangeRate } from "./exchange-rates";
import { listPlannedItems, toPlannedSchedule, type PlannedItemWithDetails } from "./planned-items";
import { linksByItem, resolveItem, toProjectionAccount } from "./projection";
import { listTransactions, type Transaction } from "./transactions";

export interface CalendarOptions {
  /** YYYY-MM. */
  month: string;
  /** YYYY-MM-DD. */
  today: string;
  /** The selected accounts. */
  accountIds: readonly number[];
  /** Currency of the balance: the reference currency, or the account's own. */
  currency: string;
}

export interface CalendarEntry {
  /** Stable React key, e.g. "t12" or "p3:2026-11-05". */
  id: string;
  /** Effective date, YYYY-MM-DD. */
  date: string;
  kind: "real" | "planned";
  /** Transaction label, or planned item name. */
  label: string;
  accountId: number;
  /** Planned transfer only. */
  destinationAccountId: number | null;
  /** Currency of `amount`: the account's own. */
  currency: string;
  /**
   * Signed minor units. For a planned occurrence, the remaining amount when partial, else the
   * expected amount.
   */
  amount: number;
  /** Null for a real transaction that settles no occurrence. */
  status: OccurrenceStatus | null;
  categoryId: number | null;
  categoryName: string | null;
  /** A real transaction linked to an occurrence. */
  settlesOccurrence: boolean;
  plannedItemId: number | null;
  nominalDate: string | null;
  /** A planned transfer whose surplus fits nowhere; `accountId` is the account that keeps it. */
  unplacedSurplus: { amount: number; accountId: number } | null;
  /** A planned transfer whose overflow chain is invalid. */
  routingInvalid: boolean;
  /** A planned occurrence skipped, moved or with a changed amount. False for a real transaction. */
  hasOverride: boolean;
  /** The date stored by the override, null when it keeps the computed date or has no override. */
  overrideDate: string | null;
  /** The signed amount stored by the override, null when it keeps the computed amount. */
  overrideAmount: number | null;
  /**
   * A planned occurrence with at least one linked transaction (a partial provision): it must be
   * unlinked before it is changed or restored. False for a real transaction.
   */
  isLinked: boolean;
}

export interface CalendarDay {
  date: string;
  entries: CalendarEntry[];
  /**
   * End of day, in `currency`, sum of the selected accounts. Null when no selected account could
   * be converted.
   */
  balance: number | null;
  isBelowZero: boolean;
}

export interface CalendarMonth {
  month: string;
  currency: string;
  /** Every day of the month, in order; a day without entries has an empty `entries`. */
  days: CalendarDay[];
  /** The first day of this month below zero. */
  firstDayBelowZero: string | null;
  unconvertedCurrencies: string[];
}

function datesOf({ from, to }: DateRange): string[] {
  const dates: string[] = [];
  for (let date = from; date <= to; date = addDays(date, 1)) dates.push(date);
  return dates;
}

// An account with no rate at the day's date is left out and reported, rather than counted at a
// wrong value (same rule as the month-end totals).
function convertDays(
  accounts: ReadonlyMap<number, Account>,
  days: readonly DailyBalance[],
  accountIds: readonly number[],
  currency: string,
  rates: readonly StoredExchangeRate[],
): { days: DailyBalance[]; unconvertedCurrencies: string[] } {
  const unconverted = new Set<string>();
  const converted = days.map(({ date, balances }) => {
    const convertedBalances = new Map<number, number>();
    for (const accountId of accountIds) {
      const account = accounts.get(accountId);
      const balance = balances.get(accountId);
      if (account === undefined || balance === undefined) continue;
      const amount = convertAmount(balance, account.currency, currency, date, rates);
      if (amount === null) unconverted.add(account.currency);
      else convertedBalances.set(accountId, amount);
    }
    return { date, balances: convertedBalances };
  });
  return { days: converted, unconvertedCurrencies: [...unconverted].sort() };
}

const routingKey = (plannedItemId: number, nominalDate: string) => `${plannedItemId}:${nominalDate}`;

function categoryNameOf(categoryId: number | null, names: ReadonlyMap<number, string>): string | null {
  return categoryId === null ? null : (names.get(categoryId) ?? null);
}

function buildRealEntry(
  transaction: Transaction,
  account: Account,
  categoryNames: ReadonlyMap<number, string>,
): CalendarEntry {
  const settlesOccurrence = transaction.plannedItemId !== null && transaction.occurrenceDate !== null;
  return {
    id: `t${transaction.id}`,
    date: transaction.date,
    kind: "real",
    label: transaction.label,
    accountId: transaction.accountId,
    destinationAccountId: null,
    currency: account.currency,
    amount: transaction.amount,
    status: settlesOccurrence ? "confirmed" : null,
    categoryId: transaction.categoryId,
    categoryName: categoryNameOf(transaction.categoryId, categoryNames),
    settlesOccurrence,
    plannedItemId: transaction.plannedItemId,
    nominalDate: transaction.occurrenceDate,
    unplacedSurplus: null,
    routingInvalid: false,
    hasOverride: false,
    overrideDate: null,
    overrideAmount: null,
    isLinked: false,
  };
}

function buildPlannedEntry(
  item: PlannedItemWithDetails,
  occurrence: ResolvedOccurrence,
  account: Account,
  categoryNames: ReadonlyMap<number, string>,
  transfers: ReadonlyMap<string, PlannedTransferRouting>,
): CalendarEntry {
  // The projection only applies a pending occurrence, so the routing means nothing for the others.
  const isPending = occurrence.status === "planned" || occurrence.status === "partial";
  const routing = isPending ? transfers.get(routingKey(item.id, occurrence.nominalDate))?.routing : undefined;
  const unplaced = routing?.status === "ok" ? routing.unplaced : 0;
  const override = item.overrides.find((candidate) => candidate.nominalDate === occurrence.nominalDate);
  return {
    id: `p${item.id}:${occurrence.nominalDate}`,
    date: occurrence.date,
    kind: "planned",
    label: item.name,
    accountId: item.accountId,
    destinationAccountId: item.destinationAccountId,
    currency: account.currency,
    amount: occurrence.status === "partial" ? occurrence.remaining : occurrence.expectedAmount,
    status: occurrence.status,
    categoryId: item.categoryId,
    categoryName: categoryNameOf(item.categoryId, categoryNames),
    settlesOccurrence: false,
    plannedItemId: item.id,
    nominalDate: occurrence.nominalDate,
    unplacedSurplus: unplaced > 0 ? { amount: unplaced, accountId: item.accountId } : null,
    // An invalid chain is reported on the row, never thrown (ADR-013).
    routingInvalid: routing?.status === "invalid",
    hasOverride: override !== undefined,
    overrideDate: override?.overrideDate ?? null,
    overrideAmount: override?.overrideAmount ?? null,
    isLinked: occurrence.links.length > 0,
  };
}

function realEntries(
  transactions: readonly Transaction[],
  accountsById: ReadonlyMap<number, Account>,
  selected: ReadonlySet<number>,
  range: DateRange,
  categoryNames: ReadonlyMap<number, string>,
): CalendarEntry[] {
  return transactions.flatMap((transaction) => {
    const account = accountsById.get(transaction.accountId);
    const isListed =
      account !== undefined &&
      selected.has(account.id) &&
      transaction.date >= range.from &&
      transaction.date <= range.to;
    return isListed ? [buildRealEntry(transaction, account, categoryNames)] : [];
  });
}

function plannedEntries(
  plannedItems: readonly PlannedItemWithDetails[],
  accountsById: ReadonlyMap<number, Account>,
  selected: ReadonlySet<number>,
  links: ReadonlyMap<number, OccurrenceLink[]>,
  routings: ReadonlyMap<string, PlannedTransferRouting>,
  range: DateRange,
  today: string,
  categoryNames: ReadonlyMap<number, string>,
): CalendarEntry[] {
  return plannedItems.flatMap((item) => {
    const account = accountsById.get(item.accountId);
    const isSelected =
      selected.has(item.accountId) ||
      (item.destinationAccountId !== null && selected.has(item.destinationAccountId));
    if (account === undefined || !isSelected) return [];
    // Resolved over the month itself rather than from today, so that a past month still shows
    // what was overdue or cancelled. A confirmed occurrence is listed through its transaction.
    return resolveOccurrences(
      {
        schedule: toPlannedSchedule(item),
        overrides: item.overrides,
        matchWindowDays: item.matchWindowDays,
        acceptsMultipleTransactions: item.acceptsMultipleTransactions,
      },
      links.get(item.id) ?? [],
      range,
      today,
    )
      .filter(
        (occurrence) =>
          occurrence.status !== "confirmed" && occurrence.date >= range.from && occurrence.date <= range.to,
      )
      .map((occurrence) => buildPlannedEntry(item, occurrence, account, categoryNames, routings));
  });
}

// Real before planned, then by id, so that the order does not depend on the order of the reads.
function compareEntries(a: CalendarEntry, b: CalendarEntry): number {
  if (a.kind !== b.kind) return a.kind === "real" ? -1 : 1;
  return a.id.localeCompare(b.id, "en", { numeric: true });
}

/**
 * One month of the line view: the real transactions and the planned occurrences of the selected
 * accounts by day, with the end-of-day balance of the real chart. Nothing is estimated (ADR-011).
 */
export function getCalendarMonth(
  db: AppDatabase,
  { month, today, accountIds, currency }: CalendarOptions,
): CalendarMonth {
  const range = { from: `${month}-01`, to: lastDayOfMonth(month) };
  const accounts = listAccounts(db, { includeArchived: true });
  const accountsById = new Map(accounts.map((account) => [account.id, account]));
  const selected = new Set(accountIds);
  const categoryNames = new Map(
    listCategories(db, { includeArchived: true }).map((category) => [category.id, category.name]),
  );
  const transactions = listTransactions(db);
  const plannedItems = listPlannedItems(db, { includeCancelled: false });
  const links = linksByItem(
    db,
    plannedItems.map((item) => item.id),
  );

  // A transfer into a selected account moves its balance, so every item is projected, not only
  // those of the selected accounts.
  const projectionTo = range.to > today ? range.to : today;
  const { days: projected, transfers } = projectWithRouting(
    accounts.map(toProjectionAccount),
    transactions.map((transaction) => ({
      accountId: transaction.accountId,
      date: transaction.date,
      amount: transaction.amount,
      source: { kind: "transaction", transactionId: transaction.id },
    })),
    plannedItems.map((item) => resolveItem(item, links.get(item.id) ?? [], today, projectionTo)),
    today,
    range,
  );
  const routings = new Map(
    transfers.map((transfer) => [routingKey(transfer.plannedItemId, transfer.nominalDate), transfer]),
  );
  const balances = convertDays(accountsById, projected, accountIds, currency, listExchangeRates(db));

  const entries = [
    ...realEntries(transactions, accountsById, selected, range, categoryNames),
    ...plannedEntries(plannedItems, accountsById, selected, links, routings, range, today, categoryNames),
  ];

  const entriesByDate = Map.groupBy(entries, (entry) => entry.date);
  const totalByDate = new Map(
    balances.days.map(({ date, balances: dayBalances }) => [
      date,
      dayBalances.size === 0 ? null : [...dayBalances.values()].reduce((sum, amount) => sum + amount, 0),
    ]),
  );
  return {
    month,
    currency,
    days: datesOf(range).map((date) => {
      const balance = totalByDate.get(date) ?? null;
      return {
        date,
        entries: (entriesByDate.get(date) ?? []).sort(compareEntries),
        balance,
        isBelowZero: balance !== null && balance < 0,
      };
    }),
    firstDayBelowZero: firstDayBelowZero(balances.days, accountIds),
    unconvertedCurrencies: balances.unconvertedCurrencies,
  };
}
