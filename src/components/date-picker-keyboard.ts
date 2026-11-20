// Date navigation of the date picker (DESIGN.md, section 9, "Custom pickers"), after the WAI-ARIA
// date picker dialog. Pure functions on calendar dates ("YYYY-MM-DD", no time zone): no DOM, no
// clock, so "today" is always an input of the caller. The arithmetic is done in UTC, which has no
// daylight saving change to shift a day.

import {
  addDays,
  clampedDate,
  daysInMonth,
  MAX_YEAR,
  MIN_YEAR,
  parseDate,
  weekdayOf,
} from "../domain/calendar-date";

// Re-exported so the callers of the picker keep their import; the definition lives in the domain.
export { addDays };

export const DAYS_IN_WEEK = 7;
const MONTHS_IN_YEAR = 12;
const MONDAY = 1;
// Intl numbers the days 1 (Monday) to 7 (Sunday); Date numbers them 0 (Sunday) to 6.
const INTL_SUNDAY = 7;

interface WeekInfoLocale {
  getWeekInfo?: () => { firstDay: number };
  weekInfo?: { firstDay: number };
}

export interface DateKeyState {
  /** The day the grid points at. */
  focused: string;
}

export interface DateKeyModifiers {
  shift: boolean;
  alt: boolean;
  ctrl: boolean;
  meta: boolean;
}

export type DateKeyAction =
  | { type: "none" }
  | { type: "move"; date: string; preventDefault: true }
  | { type: "commit"; date: string; preventDefault: true }
  | { type: "close"; preventDefault: true };

const NONE: DateKeyAction = { type: "none" };

/** The same day of another month, or the last day of that month when it is shorter. */
export function addMonths(date: string, months: number): string {
  const { year, month, day } = parseDate(date);
  const index = year * MONTHS_IN_YEAR + (month - 1) + months;
  const targetYear = Math.floor(index / MONTHS_IN_YEAR);
  // Past the supported years the date stays where it is, so a held key never produces an invalid one.
  if (targetYear < MIN_YEAR || targetYear > MAX_YEAR) return date;
  return clampedDate(targetYear, (index % MONTHS_IN_YEAR) + 1, day);
}

export function addYears(date: string, years: number): string {
  return addMonths(date, years * MONTHS_IN_YEAR);
}

/** The first day of the week of a locale, 0 (Sunday) to 6, from the platform's week data. */
export function weekStartOf(locale: string): number {
  try {
    // Chromium and Firefox expose `getWeekInfo()`, older Safari the `weekInfo` getter.
    const intlLocale: WeekInfoLocale = new Intl.Locale(locale);
    const firstDay = (intlLocale.getWeekInfo?.() ?? intlLocale.weekInfo)?.firstDay;
    return firstDay === undefined ? MONDAY : firstDay % INTL_SUNDAY;
  } catch {
    // A tag that does not parse, or a platform without week data: the ISO week.
    return MONDAY;
  }
}

// How many days the date is past the first day of its week.
function dayOfWeekRow(date: string, weekStart: number): number {
  return (weekdayOf(date) - weekStart + DAYS_IN_WEEK) % DAYS_IN_WEEK;
}

function startOfWeek(date: string, weekStart: number): string {
  return addDays(date, -dayOfWeekRow(date, weekStart));
}

/** The whole weeks that cover a month ("YYYY-MM"), each a row of seven dates. */
export function buildMonthGrid(month: string, weekStart: number): string[][] {
  const first = `${month}-01`;
  const start = startOfWeek(first, weekStart);
  const { year, month: monthNumber } = parseDate(first);
  const dayCount = daysInMonth(year, monthNumber);
  const weekCount = Math.ceil((dayOfWeekRow(first, weekStart) + dayCount) / DAYS_IN_WEEK);
  return Array.from({ length: weekCount }, (_, week) =>
    Array.from({ length: DAYS_IN_WEEK }, (_, day) => addDays(start, week * DAYS_IN_WEEK + day)),
  );
}

export function resolveDateKey(
  state: DateKeyState,
  key: string,
  modifiers: DateKeyModifiers,
  weekStart: number,
): DateKeyAction {
  if (modifiers.alt || modifiers.ctrl || modifiers.meta) return NONE;
  const move = (date: string): DateKeyAction => ({ type: "move", date, preventDefault: true });
  const { focused } = state;

  switch (key) {
    case "ArrowLeft":
      return move(addDays(focused, -1));
    case "ArrowRight":
      return move(addDays(focused, 1));
    case "ArrowUp":
      return move(addDays(focused, -DAYS_IN_WEEK));
    case "ArrowDown":
      return move(addDays(focused, DAYS_IN_WEEK));
    case "Home":
      return move(startOfWeek(focused, weekStart));
    case "End":
      return move(addDays(startOfWeek(focused, weekStart), DAYS_IN_WEEK - 1));
    case "PageUp":
      return move(modifiers.shift ? addYears(focused, -1) : addMonths(focused, -1));
    case "PageDown":
      return move(modifiers.shift ? addYears(focused, 1) : addMonths(focused, 1));
    case "Enter":
    case " ":
      return { type: "commit", date: focused, preventDefault: true };
    case "Escape":
      return { type: "close", preventDefault: true };
    default:
      return NONE;
  }
}
