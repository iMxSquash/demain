// Nominal dates of a repetition rule and the weekend business-day rule (DOMAIN, "Generating
// occurrences", steps 1 and 2). Pure: dates are "YYYY-MM-DD" strings and nothing reads a clock.

import { isCalendarDate } from "./account";
import { addDays, clampedDate, weekdayOf } from "./calendar-date";

export type Repetition =
  | { kind: "monthly_on_day"; day: number } // 1 to 31
  | { kind: "monthly_on_last_day" }
  | { kind: "every_n_months"; months: number } // integer, 1 or more
  | { kind: "quarterly" }
  | { kind: "yearly" }
  | { kind: "every_n_weeks"; weeks: number }; // integer, 1 or more

export type BusinessDayRule = "none" | "previous" | "next";

/** Both bounds inclusive, YYYY-MM-DD. */
export interface DateRange {
  from: string;
  to: string;
}

const MIN_DAY_OF_MONTH = 1;
const MAX_DAY_OF_MONTH = 31;
const MONTHS_IN_YEAR = 12;
const MONTHS_IN_QUARTER = 3;
const DAYS_IN_WEEK = 7;
const SATURDAY = 6;
const SUNDAY = 0;
const FRIDAY_BEFORE_SATURDAY = -1;
const FRIDAY_BEFORE_SUNDAY = -2;
const MONDAY_AFTER_SATURDAY = 2;
const MONDAY_AFTER_SUNDAY = 1;

function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value >= 1;
}

export function isValidRepetition(repetition: Repetition): boolean {
  switch (repetition.kind) {
    case "monthly_on_day":
      return (
        Number.isInteger(repetition.day) &&
        repetition.day >= MIN_DAY_OF_MONTH &&
        repetition.day <= MAX_DAY_OF_MONTH
      );
    case "every_n_months":
      return isPositiveInteger(repetition.months);
    case "every_n_weeks":
      return isPositiveInteger(repetition.weeks);
    case "monthly_on_last_day":
    case "quarterly":
    case "yearly":
      return true;
  }
}

interface MonthlySchedule {
  stepInMonths: number;
  dayOfMonth: number;
}

// The rules that fall on one day of a month, every `stepInMonths` months. The last day of the
// month is a day past any month length, which the clamp brings back to its real last day.
function monthlyScheduleOf(
  repetition: Exclude<Repetition, { kind: "every_n_weeks" }>,
  anchorDay: number,
): MonthlySchedule {
  switch (repetition.kind) {
    case "monthly_on_day":
      return { stepInMonths: 1, dayOfMonth: repetition.day };
    case "monthly_on_last_day":
      return { stepInMonths: 1, dayOfMonth: MAX_DAY_OF_MONTH };
    case "every_n_months":
      return { stepInMonths: repetition.months, dayOfMonth: anchorDay };
    case "quarterly":
      return { stepInMonths: MONTHS_IN_QUARTER, dayOfMonth: anchorDay };
    case "yearly":
      return { stepInMonths: MONTHS_IN_YEAR, dayOfMonth: anchorDay };
  }
}

function monthlyDates(
  schedule: MonthlySchedule,
  anchorMonthIndex: number,
  anchor: string,
  range: DateRange,
): string[] {
  const dates: string[] = [];
  // Each date is computed from its own month: moving the previous date by a month would drift
  // from 31 January to 28 February to 28 March.
  for (let monthOffset = 0; ; monthOffset += schedule.stepInMonths) {
    const monthIndex = anchorMonthIndex + monthOffset;
    const date = clampedDate(
      Math.floor(monthIndex / MONTHS_IN_YEAR),
      (monthIndex % MONTHS_IN_YEAR) + 1,
      schedule.dayOfMonth,
    );
    if (date > range.to) return dates;
    if (date >= anchor && date >= range.from) dates.push(date);
  }
}

function weeklyDates(weeks: number, anchor: string, range: DateRange): string[] {
  const dates: string[] = [];
  for (let date = anchor; date <= range.to; date = addDays(date, weeks * DAYS_IN_WEEK)) {
    if (date >= range.from) dates.push(date);
  }
  return dates;
}

/**
 * The nominal dates of a rule inside a range. The anchor is the start date of the planned item and
 * a lower bound: the first date is the first one of the rule on or after it. A `null` repetition is
 * a one-off event on the anchor.
 */
export function nominalDates(repetition: Repetition | null, anchor: string, range: DateRange): string[] {
  if (repetition !== null && !isValidRepetition(repetition)) {
    throw new RangeError(`Invalid repetition ${JSON.stringify(repetition)}`);
  }
  for (const date of [anchor, range.from, range.to]) {
    if (!isCalendarDate(date)) throw new RangeError(`Invalid date "${date}", expected YYYY-MM-DD`);
  }

  if (repetition === null) return anchor >= range.from && anchor <= range.to ? [anchor] : [];

  if (repetition.kind === "every_n_weeks") return weeklyDates(repetition.weeks, anchor, range);
  const [anchorYear = 0, anchorMonth = 1, anchorDay = 1] = anchor.split("-").map(Number);
  const anchorMonthIndex = anchorYear * MONTHS_IN_YEAR + (anchorMonth - 1);
  return monthlyDates(monthlyScheduleOf(repetition, anchorDay), anchorMonthIndex, anchor, range);
}

/** Moves a Saturday or a Sunday to the previous Friday or the next Monday; the weekdays stay. */
export function adjustToBusinessDay(date: string, rule: BusinessDayRule): string {
  if (rule === "none") return date;
  const weekday = weekdayOf(date);
  if (weekday !== SATURDAY && weekday !== SUNDAY) return date;
  if (rule === "previous") return addDays(date, weekday === SATURDAY ? FRIDAY_BEFORE_SATURDAY : FRIDAY_BEFORE_SUNDAY);
  return addDays(date, weekday === SATURDAY ? MONDAY_AFTER_SATURDAY : MONDAY_AFTER_SUNDAY);
}
