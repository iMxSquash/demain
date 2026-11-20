// Nominal dates of a repetition rule and the weekend business-day rule (DOMAIN, "Generating
// occurrences", steps 1 and 2). Pure: dates are "YYYY-MM-DD" strings and nothing reads a clock.

import { isCalendarDate } from "./account";
import { addDays, clampedDate, DAYS_IN_WEEK, MONTHS_IN_YEAR, parseDate, weekdayOf } from "./calendar-date";

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
const MONTHS_IN_QUARTER = 3;
const SATURDAY = 6;
const SUNDAY = 0;

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
  const lastYear = parseDate(range.to).year;
  const dates: string[] = [];
  // Each date is computed from its own month: moving the previous date by a month would drift
  // from 31 January to 28 February to 28 March.
  for (let monthOffset = 0; ; monthOffset += schedule.stepInMonths) {
    const monthIndex = anchorMonthIndex + monthOffset;
    const year = Math.floor(monthIndex / MONTHS_IN_YEAR);
    // Also what keeps the loop inside the supported years, whose last day `range.to` cannot pass.
    if (year > lastYear) return dates;
    const date = clampedDate(year, (monthIndex % MONTHS_IN_YEAR) + 1, schedule.dayOfMonth);
    if (date > range.to) return dates;
    if (date >= anchor && date >= range.from) dates.push(date);
  }
}

function weeklyDates(weeks: number, anchor: string, range: DateRange): string[] {
  const dates: string[] = [];
  let date = anchor;
  while (date <= range.to) {
    if (date >= range.from) dates.push(date);
    const next = addDays(date, weeks * DAYS_IN_WEEK);
    // `addDays` stays put at the last supported day: without this the loop would never end.
    if (next === date) break;
    date = next;
  }
  return dates;
}

/**
 * The nominal dates of a rule inside a range. The anchor is the start date of the planned item and
 * a lower bound: the first date is the first one of the rule on or after it. A `null` repetition is
 * a one-off event on the anchor.
 */
export function nominalDates(repetition: Repetition | null, anchor: string, range: DateRange): string[] {
  // Callers validate user input with `isValidRepetition` and `isCalendarDate` first: reaching one
  // of these throws is a programming error, so it carries no translatable message reference.
  if (repetition !== null && !isValidRepetition(repetition)) {
    throw new RangeError(`Invalid repetition ${JSON.stringify(repetition)}`);
  }
  for (const date of [anchor, range.from, range.to]) {
    if (!isCalendarDate(date)) throw new RangeError(`Invalid date "${date}", expected YYYY-MM-DD`);
  }

  if (repetition === null) return anchor >= range.from && anchor <= range.to ? [anchor] : [];

  if (repetition.kind === "every_n_weeks") return weeklyDates(repetition.weeks, anchor, range);
  const { year, month, day } = parseDate(anchor);
  const anchorMonthIndex = year * MONTHS_IN_YEAR + (month - 1);
  return monthlyDates(monthlyScheduleOf(repetition, day), anchorMonthIndex, anchor, range);
}

// Days to add to a Saturday or a Sunday to reach the Friday before or the Monday after.
const WEEKEND_SHIFT_DAYS: Record<Exclude<BusinessDayRule, "none">, Readonly<Record<number, number>>> = {
  previous: { [SATURDAY]: -1, [SUNDAY]: -2 },
  next: { [SATURDAY]: 2, [SUNDAY]: 1 },
};

/** Moves a Saturday or a Sunday to the previous Friday or the next Monday; the weekdays stay. */
export function adjustToBusinessDay(date: string, rule: BusinessDayRule): string {
  if (rule === "none") return date;
  const shift = WEEKEND_SHIFT_DAYS[rule][weekdayOf(date)];
  return shift === undefined ? date : addDays(date, shift);
}
