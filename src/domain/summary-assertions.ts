/**
 * Turns the real account balances of the sheet's Summary tab into balance
 * assertions at the last day of each month. Pure functions: "today" is an
 * input, there is no clock and no database. See DOMAIN, entity Balance
 * assertion and section Migration from the sheet.
 */

import type { BalanceAssertionInput } from "./balance-assertion";
import type { SummaryBalance } from "./sheet-summary";
import type { Month } from "./synthesis";

export interface SummaryTargetAccount {
  id: number;
  /** Calendar date, YYYY-MM-DD. */
  openingDate: string;
  archived: boolean;
}

export type SummaryRefusalReason =
  | "accountArchived"
  /** The month ended before the account opened. */
  | "beforeOpening"
  /** The month is not over: its last day is after today. */
  | "afterToday";

export interface SummaryRefusal {
  month: Month;
  reason: SummaryRefusalReason;
}

export interface SummaryAssertionPlan {
  /** Without a note, ready to be recorded. */
  assertions: Pick<BalanceAssertionInput, "accountId" | "date" | "amount">[];
  /** Months the sheet reports no balance for: nothing to create, nothing wrong. */
  withoutBalance: Month[];
  refused: SummaryRefusal[];
}

/** The last day of a "YYYY-MM" month, as YYYY-MM-DD. */
export function lastDayOfMonth(month: Month): string {
  const [year = 0, number = 0] = month.split("-").map(Number);
  // Day 0 of the next month is the last day of this one, leap years included.
  const day = new Date(Date.UTC(year, number, 0)).getUTCDate();
  return `${month}-${String(day).padStart(2, "0")}`;
}

/**
 * The assertions a Summary would create for an account, and the months it
 * refuses: an archived account is no longer changed, a month that ended
 * before the account opened has no computed balance to compare with, and a
 * month that is not over yet has no real balance to record.
 */
export function planSummaryAssertions(
  balances: readonly SummaryBalance[],
  account: SummaryTargetAccount,
  today: string,
): SummaryAssertionPlan {
  const plan: SummaryAssertionPlan = {
    assertions: [],
    withoutBalance: [],
    refused: [],
  };
  for (const { month, amount } of balances) {
    if (amount === null) {
      plan.withoutBalance.push(month);
      continue;
    }
    const date = lastDayOfMonth(month);
    const reason = refusalOf(date, account, today);
    if (reason !== null) {
      plan.refused.push({ month, reason });
      continue;
    }
    plan.assertions.push({ accountId: account.id, date, amount });
  }
  return plan;
}

function refusalOf(
  date: string,
  account: SummaryTargetAccount,
  today: string,
): SummaryRefusalReason | null {
  if (account.archived) return "accountArchived";
  // "YYYY-MM-DD" strings sort chronologically.
  if (date < account.openingDate) return "beforeOpening";
  if (date > today) return "afterToday";
  return null;
}
