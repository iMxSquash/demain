// Provisions: planned items settled by several transactions inside a period (DOMAIN, "Planned vs
// actual"). Pure: dates and data are arguments, nothing reads a clock or a store.

import {
  addDays,
  addMonths,
  clampedDate,
  DAYS_IN_WEEK,
  daysInMonth,
  MONTHS_IN_YEAR,
  parseDate,
} from "./calendar-date";
import { labelContains } from "./categorization-rule";
import type { DateRange, Repetition } from "./recurrence";
import type { EnteredTransactionKind } from "./transaction";

const MONTHS_IN_QUARTER = 3;

/** What a transaction must expose to be tested as a candidate of a provision. */
export interface ProvisionCandidateTransaction {
  accountId: number;
  categoryId: number | null;
  date: string;
  label: string;
  kind: EnteredTransactionKind | "transfer";
}

/** The fields of a planned item that select the transactions settling it. */
export interface ProvisionItem {
  accountId: number;
  categoryId: number | null;
  provisionLabelFilter: string | null;
}

// Only the first occurrence of a schedule needs it: it has no predecessor to start its period from.
function stepBack(nominalDate: string, repetition: Repetition): string {
  switch (repetition.kind) {
    case "every_n_weeks":
      return addDays(nominalDate, -repetition.weeks * DAYS_IN_WEEK);
    case "every_n_months":
      return addMonths(nominalDate, -repetition.months);
    case "quarterly":
      return addMonths(nominalDate, -MONTHS_IN_QUARTER);
    case "yearly":
      return addMonths(nominalDate, -MONTHS_IN_YEAR);
    case "monthly_on_day":
    case "monthly_on_last_day":
      return addMonths(nominalDate, -1);
  }
}

function isMonthly(repetition: Repetition): boolean {
  return (
    repetition.kind === "monthly_on_day" ||
    repetition.kind === "monthly_on_last_day" ||
    (repetition.kind === "every_n_months" && repetition.months === 1)
  );
}

/**
 * The period a provision settles, both bounds inclusive. A monthly one covers the calendar month of
 * its nominal date. Any other one runs from the day after the previous nominal date to its own; the
 * first one has no previous date and is given the length of the others, as if an occurrence existed
 * one repetition earlier.
 */
export function provisionPeriod(
  nominalDate: string,
  previousNominalDate: string | null,
  repetition: Repetition,
): DateRange {
  if (isMonthly(repetition)) {
    const { year, month } = parseDate(nominalDate);
    return { from: clampedDate(year, month, 1), to: clampedDate(year, month, daysInMonth(year, month)) };
  }
  const previous = previousNominalDate ?? stepBack(nominalDate, repetition);
  return { from: addDays(previous, 1), to: nominalDate };
}

/**
 * Whether a transaction can settle the occurrence of a provision whose period is given: same
 * account and category, dated inside the period, label containing the filter (the "contains" rule
 * of categorization, see `labelContains`). A transfer is never a candidate.
 */
export function isProvisionCandidate(
  transaction: ProvisionCandidateTransaction,
  provision: ProvisionItem,
  period: DateRange,
): boolean {
  if (transaction.kind === "transfer") return false;
  if (transaction.accountId !== provision.accountId) return false;
  if (transaction.categoryId !== provision.categoryId) return false;
  if (transaction.date < period.from || transaction.date > period.to) return false;
  return provision.provisionLabelFilter === null || labelContains(transaction.label, provision.provisionLabelFilter);
}
