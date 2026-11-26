import { addDays, addMonths, clampedDate, daysInMonth, parseDate } from "./calendar-date";
import { divideRound } from "./money";
import type { DateRange } from "./recurrence";

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
  type: "expense" | "income" | "interest" | "transfer";
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
  const currentMonthStart = firstDayOfMonth(today);
  const windowStart = addMonths(currentMonthStart, -window);
  const activeAccounts = new Map(
    accounts.filter((account) => !account.archived).map((account) => [account.id, account]),
  );
  const lines = new Map<string, LineKey & { total: number }>();
  const lineOf = (key: LineKey) => {
    const id = keyOf(key);
    const line = lines.get(id) ?? {
      accountId: key.accountId,
      categoryId: key.categoryId,
      total: 0,
    };
    lines.set(id, line);
    return line;
  };

  const usedFrom = new Map(
    [...activeAccounts.values()].map((account) => {
      const starts = usedMonthStarts(account.openingDate, window, currentMonthStart);
      return [account.id, { from: starts[0], monthsUsed: starts.length }];
    }),
  );

  for (const transaction of transactions) {
    const used = usedFrom.get(transaction.accountId);
    if (!used || !isEstimatedSpending(transaction)) continue;
    if (transaction.date < windowStart || transaction.date >= currentMonthStart) continue;
    const line = lineOf(transaction);
    if (used.from !== undefined && transaction.date >= used.from) line.total += transaction.amount;
  }

  const overrideByLine = new Map<string, number>();
  for (const override of overrides) {
    if (!activeAccounts.has(override.accountId)) continue;
    lineOf(override);
    overrideByLine.set(keyOf(override), override.monthlyAmount);
  }

  return [...lines.values()].sort(compareLines).map(({ accountId, categoryId, total }) => {
    const monthsUsed = usedFrom.get(accountId)?.monthsUsed ?? 0;
    const averageSpending = monthsUsed === 0 ? 0 : Math.max(0, divideRound(-total, monthsUsed));
    const override = overrideByLine.get(keyOf({ accountId, categoryId }));
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

function datesFrom(first: string, last: string): string[] {
  const dates: string[] = [];
  for (let date = first; date <= last; date = addDays(date, 1)) dates.push(date);
  return dates;
}

/** What the line spent from the first day of the month of `today` to `today` included, zero or more. */
function spentThisMonth(
  line: LineKey,
  transactions: readonly EstimateTransaction[],
  today: string,
): number {
  const monthStart = firstDayOfMonth(today);
  const total = transactions
    .filter(
      (transaction) =>
        transaction.accountId === line.accountId &&
        transaction.categoryId === line.categoryId &&
        isEstimatedSpending(transaction) &&
        transaction.date >= monthStart &&
        transaction.date <= today,
    )
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  // Net refunds never raise the estimate of the month above the monthly one.
  return Math.max(0, -total);
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
  const flows: EstimatedFlow[] = [];
  for (const line of lines) {
    const { accountId, categoryId } = line;
    let amount = Math.max(0, line.monthlySpending - spentThisMonth(line, transactions, today));
    for (let first = today; first <= range.to; first = addDays(lastDayOfMonth(first), 1)) {
      const days = datesFrom(first, lastDayOfMonth(first));
      const shares = spreadEvenly(amount, days);
      days.forEach((date, index) => {
        const share = shares[index] ?? 0;
        if (share === 0 || date < range.from || date > range.to) return;
        flows.push({ accountId, categoryId, date, amount: -share });
      });
      amount = line.monthlySpending;
    }
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
