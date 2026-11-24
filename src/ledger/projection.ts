import { and, inArray, isNotNull } from "drizzle-orm";

import { addDays, daysInMonth } from "../domain/calendar-date";
import { convertAmount } from "../domain/exchange-rate";
import { resolveOccurrences, type OccurrenceLink } from "../domain/occurrence-resolution";
import {
  projectWithRouting,
  type DailyBalance,
  type PlannedItemOccurrences,
  type ProjectionAccount,
  type ProjectionFlow,
} from "../domain/projection";
import { monthOf, type Month } from "../domain/synthesis";
import type { AppDatabase } from "../storage/database";
import { transactions } from "../storage/schema";
import { listAccounts, type Account } from "./accounts";
import { listExchangeRates, type StoredExchangeRate } from "./exchange-rates";
import { listPlannedItems, toPlannedSchedule, type PlannedItemWithDetails } from "./planned-items";
import { listTransactions } from "./transactions";

export interface PlannedMonthEnd {
  month: Month;
  /** Checking total at the end of the month, in the reference currency. */
  checking: number;
  savings: number;
  /** Currencies left out of the totals because no rate applies at the month-end date. */
  unconvertedCurrencies: string[];
}

export interface PlannedTrajectoryOptions {
  referenceCurrency: string;
  /** YYYY-MM-DD: the current month is the first planned one. */
  today: string;
  /** Number of months from the current one, inclusive. */
  months: number;
}

// A still-planned occurrence is at most its match window past its date, and a business-day rule
// moves a date by two days at most (same margin as the occurrence resolution).
const BUSINESS_DAY_SHIFT_MARGIN_DAYS = 2;

interface MonthEndDate {
  month: Month;
  date: string;
}

function monthEnds(today: string, count: number): MonthEndDate[] {
  const [year = 0, month = 1] = monthOf(today).split("-").map(Number);
  return Array.from({ length: count }, (_, offset) => {
    const date = new Date(Date.UTC(year, month - 1 + offset, 1));
    const endYear = date.getUTCFullYear();
    const endMonth = date.getUTCMonth() + 1;
    const key = `${endYear}-${String(endMonth).padStart(2, "0")}`;
    return { month: key, date: `${key}-${String(daysInMonth(endYear, endMonth)).padStart(2, "0")}` };
  });
}

function toProjectionAccount(account: Account): ProjectionAccount {
  return {
    id: account.id,
    currency: account.currency,
    openingDate: account.openingDate,
    openingBalance: account.openingBalance,
    ceiling: account.depositCeiling,
    overflowAccountId: account.overflowAccountId,
    archived: account.archived,
  };
}

// The links of the planned items, read apart from the matching module so that the projection
// does not depend on its internals: a settled occurrence must not be counted a second time.
function linksByItem(db: AppDatabase, itemIds: number[]): Map<number, OccurrenceLink[]> {
  if (itemIds.length === 0) return new Map();
  const rows = db
    .select({
      transactionId: transactions.id,
      plannedItemId: transactions.plannedItemId,
      occurrenceDate: transactions.occurrenceDate,
      date: transactions.date,
      amount: transactions.amount,
    })
    .from(transactions)
    .where(and(inArray(transactions.plannedItemId, itemIds), isNotNull(transactions.occurrenceDate)))
    .all();
  // The where clause keeps linked transactions only, so the nullable columns are set.
  return Map.groupBy(
    rows.map(({ occurrenceDate, ...link }) => ({ ...link, occurrenceDate: occurrenceDate! })),
    (link) => link.plannedItemId!,
  );
}

function resolveItem(
  item: PlannedItemWithDetails,
  links: readonly OccurrenceLink[],
  today: string,
  to: string,
): PlannedItemOccurrences {
  const from = addDays(today, -(item.matchWindowDays + BUSINESS_DAY_SHIFT_MARGIN_DAYS));
  return {
    plannedItemId: item.id,
    kind: item.kind,
    accountId: item.accountId,
    destinationAccountId: item.destinationAccountId,
    occurrences: resolveOccurrences(
      {
        schedule: toPlannedSchedule(item),
        overrides: item.overrides,
        matchWindowDays: item.matchWindowDays,
        acceptsMultipleTransactions: item.acceptsMultipleTransactions,
      },
      links,
      { from, to },
      today,
    ),
  };
}

// Totals are summed per kind in the reference currency; an account whose currency has no rate at
// the month-end date is left out and reported, rather than counted at a wrong value.
function monthEndTotals(
  accounts: readonly Account[],
  days: readonly DailyBalance[],
  ends: readonly MonthEndDate[],
  referenceCurrency: string,
  rates: readonly StoredExchangeRate[],
): PlannedMonthEnd[] {
  const balancesByDate = new Map(days.map((day) => [day.date, day.balances]));
  return ends.map(({ month, date }) => {
    const totals = { checking: 0, savings: 0 };
    const unconverted = new Set<string>();
    for (const account of accounts) {
      const balance = balancesByDate.get(date)?.get(account.id);
      if (balance === undefined || account.kind === "other") continue;
      const converted = convertAmount(balance, account.currency, referenceCurrency, date, rates);
      if (converted === null) unconverted.add(account.currency);
      else totals[account.kind] += converted;
    }
    return { month, ...totals, unconvertedCurrencies: [...unconverted].sort() };
  });
}

/**
 * Month-end totals of the checking and savings accounts from the start of the current month:
 * the real transactions so far plus the dated planned items still expected (DOMAIN, the real
 * chart; ADR-011). Nothing else is estimated, so without any planned item still to come the
 * result is empty.
 */
export function getPlannedTrajectory(
  db: AppDatabase,
  { referenceCurrency, today, months }: PlannedTrajectoryOptions,
): PlannedMonthEnd[] {
  const accounts = listAccounts(db, { includeArchived: true });
  const projectionAccounts = accounts.map(toProjectionAccount);
  // Every leg of a transfer is a transaction of its own, so each one is a flow as stored.
  const realFlows: ProjectionFlow[] = listTransactions(db).map((transaction) => ({
    accountId: transaction.accountId,
    date: transaction.date,
    amount: transaction.amount,
    source: { kind: "transaction", transactionId: transaction.id },
  }));
  const ends = monthEnds(today, months);
  const lastEnd = ends.at(-1);
  if (lastEnd === undefined) return [];

  const plannedItems = listPlannedItems(db, { includeCancelled: false });
  const links = linksByItem(
    db,
    plannedItems.map((item) => item.id),
  );
  const items = plannedItems.map((item) => resolveItem(item, links.get(item.id) ?? [], today, lastEnd.date));

  // Flows dated before `from` weigh on its first day, so balances at each month end are exact.
  const rates = listExchangeRates(db);
  const range = { from: `${ends[0]!.month}-01`, to: lastEnd.date };
  const project = (planned: readonly PlannedItemOccurrences[]) =>
    monthEndTotals(
      accounts,
      projectWithRouting(projectionAccounts, realFlows, planned, today, range).days,
      ends,
      referenceCurrency,
      rates,
    );
  const withPlanned = project(items);
  const baseline = project([]);
  const isUnchanged = withPlanned.every(
    (month, index) =>
      month.checking === baseline[index]!.checking && month.savings === baseline[index]!.savings,
  );
  return isUnchanged ? [] : withPlanned;
}
