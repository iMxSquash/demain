import { isCalendarDate } from "./account";
import { addDays, addMonths, clampedDate, daysInMonth, parseDate } from "./calendar-date";
import { divideRound } from "./money";
import type { DateRange } from "./recurrence";
import type { EnteredTransactionKind } from "./transaction";

export type EstimationWindow = 3 | 6 | 12;
export const ESTIMATION_WINDOWS: readonly EstimationWindow[] = [3, 6, 12];

export interface EstimateAccount {
  id: number;
  openingDate: string;
  archived: boolean;
}

export interface EstimateTransaction {
  accountId: number;
  categoryId: number | null;
  date: string;
  /** Signed minor units, as stored. */
  amount: number;
  type: EnteredTransactionKind | "transfer";
  /** True when the transaction settles an occurrence of a planned item. */
  linkedToPlannedItem: boolean;
}

/** A monthly spending set by the user for one line (D3). Zero or more. */
export interface EstimateOverride {
  accountId: number;
  categoryId: number | null;
  monthlyAmount: number;
}

export interface EstimateLine {
  accountId: number;
  categoryId: number | null;
  /** Monthly spending, zero or more, in the account's currency. */
  monthlySpending: number;
  /** Complete months used by the average (0 to the window). */
  monthsUsed: number;
  /** The average before any override, so that the screen can show both. */
  averageSpending: number;
  overridden: boolean;
}

export interface EstimatedFlow {
  accountId: number;
  categoryId: number | null;
  date: string;
  /** Negative minor units. */
  amount: number;
}

interface LineKey {
  accountId: number;
  categoryId: number | null;
}

function keyOf({ accountId, categoryId }: LineKey): string {
  return `${accountId}:${categoryId ?? ""}`;
}

/** Account id first, then category id, the uncategorized line of an account last (D5). */
function compareLines(a: LineKey, b: LineKey): number {
  if (a.accountId !== b.accountId) return a.accountId - b.accountId;
  if (a.categoryId === b.categoryId) return 0;
  if (a.categoryId === null) return 1;
  if (b.categoryId === null) return -1;
  return a.categoryId - b.categoryId;
}

function firstDayOfMonth(date: string): string {
  const { year, month } = parseDate(date);
  return clampedDate(year, month, 1);
}

/** Eligible for an estimate line (D1): an expense not linked to a planned item. */
function isEstimatedSpending(transaction: EstimateTransaction): boolean {
  return transaction.type === "expense" && !transaction.linkedToPlannedItem;
}

/** The first day of the complete months of the window that start on or after the opening date (D2). */
function usedMonthStarts(
  openingDate: string,
  window: EstimationWindow,
  currentMonthStart: string,
): string[] {
  const starts: string[] = [];
  for (let back = window; back >= 1; back -= 1) {
    const start = addMonths(currentMonthStart, -back);
    if (start >= openingDate) starts.push(start);
  }
  return starts;
}

function assertMonthlyAmount(amount: number, name: string): void {
  if (!Number.isSafeInteger(amount) || amount < 0) {
    throw new RangeError(`${name} expects a safe integer of zero or more, got ${amount}`);
  }
}

function assertCalendarDate(date: string, name: string): void {
  if (!isCalendarDate(date)) throw new RangeError(`${name} expects a calendar date, got ${date}`);
}

/**
 * The estimate lines of the active accounts (D1 to D3): the average spending of each line over the
 * complete months of the window, replaced by its override when the user set one.
 */
export function estimateLines(
  accounts: readonly EstimateAccount[],
  transactions: readonly EstimateTransaction[],
  overrides: readonly EstimateOverride[],
  window: EstimationWindow,
  today: string,
): EstimateLine[] {
  assertCalendarDate(today, "estimateLines");
  const currentMonthStart = firstDayOfMonth(today);
  const windowStart = addMonths(currentMonthStart, -window);
  const usedMonths = new Map(
    accounts
      .filter((account) => !account.archived)
      .map((account) => {
        const starts = usedMonthStarts(account.openingDate, window, currentMonthStart);
        return [account.id, { from: starts[0], count: starts.length }];
      }),
  );
  const lines = new Map<string, LineKey & { total: number; override?: number }>();
  const lineOf = ({ accountId, categoryId }: LineKey) => {
    const id = keyOf({ accountId, categoryId });
    let line = lines.get(id);
    if (!line) {
      line = { accountId, categoryId, total: 0 };
      lines.set(id, line);
    }
    return line;
  };

  for (const transaction of transactions) {
    const used = usedMonths.get(transaction.accountId);
    if (!used || !isEstimatedSpending(transaction)) continue;
    if (transaction.date < windowStart || transaction.date >= currentMonthStart) continue;
    const line = lineOf(transaction);
    if (used.from !== undefined && transaction.date >= used.from) line.total += transaction.amount;
  }

  for (const override of overrides) {
    if (!usedMonths.has(override.accountId)) continue;
    assertMonthlyAmount(override.monthlyAmount, "estimateLines");
    lineOf(override).override = override.monthlyAmount;
  }

  return [...lines.values()]
    .sort(compareLines)
    .map(({ accountId, categoryId, total, override }) => {
      const monthsUsed = usedMonths.get(accountId)?.count ?? 0;
      const averageSpending = monthsUsed === 0 ? 0 : Math.max(0, divideRound(-total, monthsUsed));
      return {
        accountId,
        categoryId,
        monthlySpending: override ?? averageSpending,
        monthsUsed,
        averageSpending,
        overridden: override !== undefined,
      };
    });
}

function lastDayOfMonth(date: string): string {
  const { year, month } = parseDate(date);
  return clampedDate(year, month, daysInMonth(year, month));
}

/** The dates from `first` to the end of its month, both included. */
function datesToMonthEnd(first: string): string[] {
  const { year, month, day } = parseDate(first);
  const count = daysInMonth(year, month) - day + 1;
  return Array.from({ length: count }, (_, index) => clampedDate(year, month, day + index));
}

/**
 * What each line spent from the first day of the month of `today` to `today` included, keyed by
 * line. Net refunds count as nothing spent, so they never raise the estimate of the month.
 */
function spentThisMonthByLine(
  transactions: readonly EstimateTransaction[],
  today: string,
): Map<string, number> {
  const monthStart = firstDayOfMonth(today);
  const totals = new Map<string, number>();
  for (const transaction of transactions) {
    if (!isEstimatedSpending(transaction)) continue;
    if (transaction.date < monthStart || transaction.date > today) continue;
    const id = keyOf(transaction);
    totals.set(id, (totals.get(id) ?? 0) + transaction.amount);
  }
  return new Map([...totals].map(([id, total]) => [id, Math.max(0, -total)]));
}

function compareFlows(a: EstimatedFlow, b: EstimatedFlow): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  return compareLines(a, b);
}

/**
 * The daily estimated flows of the lines over `range` (D4 rule 2): what remains of the current month
 * from `today` to its end, then each later month in full. Each month is spread before the days outside
 * `range` are dropped, so cutting a month does not change the amount of a day.
 */
export function estimatedFlows(
  lines: readonly EstimateLine[],
  transactions: readonly EstimateTransaction[],
  range: DateRange,
  today: string,
): EstimatedFlow[] {
  for (const date of [today, range.from, range.to]) assertCalendarDate(date, "estimatedFlows");
  for (const line of lines) assertMonthlyAmount(line.monthlySpending, "estimatedFlows");

  // Each month starts on its first day, except the current one, which starts today. Months that end
  // before the range give nothing, so the walk starts at the month of the range when it is later.
  const months: string[] = [];
  const startsAfterToday = range.from > lastDayOfMonth(today);
  let first = startsAfterToday ? firstDayOfMonth(range.from) : today;
  while (first <= range.to) {
    months.push(first);
    const last = lastDayOfMonth(first);
    const next = addDays(last, 1);
    // `addDays` stays on the last supported day instead of passing it.
    if (next === last) break;
    first = next;
  }

  const spent = spentThisMonthByLine(transactions, today);
  const flows: EstimatedFlow[] = [];
  for (const line of lines) {
    const { accountId, categoryId, monthlySpending } = line;
    months.forEach((monthFirst) => {
      const isCurrentMonth = monthFirst === today;
      const amount = isCurrentMonth
        ? Math.max(0, monthlySpending - (spent.get(keyOf(line)) ?? 0))
        : monthlySpending;
      if (amount === 0) return;
      const days = datesToMonthEnd(monthFirst);
      const shares = spreadEvenly(amount, days);
      days.forEach((date, index) => {
        const share = shares[index] ?? 0;
        if (share === 0 || date < range.from || date > range.to) return;
        flows.push({ accountId, categoryId, date, amount: -share });
      });
    });
  }
  return flows.sort(compareFlows);
}

/** Spreads `amount` (zero or more) over `days` dates: floor per day, remainder to the first days. */
export function spreadEvenly(amount: number, days: readonly string[]): number[] {
  if (!Number.isSafeInteger(amount) || amount < 0) {
    throw new RangeError(`spreadEvenly expects a safe integer of zero or more, got ${amount}`);
  }
  if (days.length === 0) return [];
  const remainder = amount % days.length;
  // The difference is a multiple of the number of days, so this division is exact.
  const share = (amount - remainder) / days.length;
  return days.map((_, index) => (index < remainder ? share + 1 : share));
}
