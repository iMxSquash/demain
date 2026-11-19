// Pure helpers on calendar dates ("YYYY-MM-DD", no time zone). The arithmetic is done in UTC, which
// has no daylight saving change to shift a day. Shared by the date picker and the recurrence rules.

const MIN_YEAR = 1;
const MAX_YEAR = 9999;
const YEAR_WIDTH = 4;
const PART_WIDTH = 2;

interface Parts {
  year: number;
  month: number;
  day: number;
}

function parse(date: string): Parts {
  const [year, month, day] = date.split("-").map(Number);
  return { year: year ?? MIN_YEAR, month: month ?? 1, day: day ?? 1 };
}

function format({ year, month, day }: Parts): string {
  const pad = (value: number, width: number) => String(value).padStart(width, "0");
  return `${pad(year, YEAR_WIDTH)}-${pad(month, PART_WIDTH)}-${pad(day, PART_WIDTH)}`;
}

// `Date.UTC` reads the years 0 to 99 as 1900 to 1999, `setUTCFullYear` does not.
function toUtc({ year, month, day }: Parts): Date {
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  return date;
}

function fromUtc(date: Date): Parts {
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

/** The number of days of a month, `month` from 1 to 12. */
export function daysInMonth(year: number, month: number): number {
  return fromUtc(toUtc({ year, month: month + 1, day: 0 })).day;
}

/** The given day, or the last day of the month when the month is shorter. */
export function clampedDate(year: number, month: number, day: number): string {
  return format({ year, month, day: Math.min(day, daysInMonth(year, month)) });
}

/** The day of the week, 0 (Sunday) to 6 (Saturday). */
export function weekdayOf(date: string): number {
  return toUtc(parse(date)).getUTCDay();
}

// Past the supported years the date stays where it is, so a held key never produces an invalid one.
export function addDays(date: string, days: number): string {
  const moved = toUtc(parse(date));
  moved.setUTCDate(moved.getUTCDate() + days);
  const candidate = fromUtc(moved);
  return candidate.year < MIN_YEAR || candidate.year > MAX_YEAR ? date : format(candidate);
}
