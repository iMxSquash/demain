/**
 * Calendar dates (YYYY-MM-DD) carry no time zone: they are read and shown as
 * UTC so that the displayed day never shifts with the zone of the viewer.
 */

export function formatCalendarDate(date: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

/** The weekday with the day, "Tuesday, November 17, 2026": what a screen reader says for a day. */
export function formatFullCalendarDate(date: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "full",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

// 2023-01-01 is a Sunday.
const SUNDAY_REFERENCE_DAY = 1;

/** The name of a weekday, 0 (Sunday) to 6 (Saturday). */
export function formatWeekday(weekday: number, locale: string, width: "short" | "long"): string {
  return new Intl.DateTimeFormat(locale, { weekday: width, timeZone: "UTC" }).format(
    new Date(Date.UTC(2023, 0, SUNDAY_REFERENCE_DAY + weekday)),
  );
}

/** `month` is "YYYY-MM". */
export function formatMonth(month: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${month}-01T00:00:00Z`));
}

/** A compact `formatMonth` for an axis label: "Jan 26". `month` is "YYYY-MM". */
export function formatShortMonth(month: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  }).format(new Date(`${month}-01T00:00:00Z`));
}

/** The calendar date, YYYY-MM-DD, of an instant in the given IANA time zone. */
export function todayIn(timeZone: string, now: Date): string {
  // The en-CA locale writes dates as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
