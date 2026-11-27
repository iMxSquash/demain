// The horizon of a simulation (DOMAIN, Comparison and diagrams, D12). One rule, read by the page,
// the date picker (its min and max) and the server. Pure: "today" is an argument.

import { isCalendarDate } from "./account";
import { addMonths, clampedDate, daysInMonth, parseDate } from "./calendar-date";
import { messageRef, type MessageRef } from "./message";
import type { DateRange } from "./recurrence";

export const HORIZON_PRESETS = [6, 12, 24] as const;

export type HorizonPreset = (typeof HORIZON_PRESETS)[number];

export type HorizonChoice =
  { kind: "months"; months: HorizonPreset } | { kind: "custom"; endDate: string };

const DEFAULT_PRESET: HorizonPreset = 12;
const CUSTOM_MIN_MONTHS = 1;
const CUSTOM_MAX_MONTHS = 120;
const CUSTOM = "custom";

/** The last day of the month that comes `months` months after the month of `today`. */
function endOfMonthAfter(today: string, months: number): string {
  const { year, month } = parseDate(addMonths(today, months));
  return clampedDate(year, month, daysInMonth(year, month));
}

/** From today to the end of the horizon (D12). */
export function horizonRange(choice: HorizonChoice, today: string): DateRange {
  const to = choice.kind === "months" ? endOfMonthAfter(today, choice.months) : choice.endDate;
  return { from: today, to };
}

/** The first and last accepted custom end dates, both included (D12). */
export function customEndBounds(today: string): { min: string; max: string } {
  return { min: addMonths(today, CUSTOM_MIN_MONTHS), max: addMonths(today, CUSTOM_MAX_MONTHS) };
}

/** Reads the query parameters `h` ("6", "12", "24" or "custom") and `end`; a missing `h` is 12 months. */
export function parseHorizon(
  query: { h?: string; end?: string },
  today: string,
): { ok: true; choice: HorizonChoice } | { ok: false; error: MessageRef } {
  const { h, end } = query;
  if (h === undefined) return { ok: true, choice: { kind: "months", months: DEFAULT_PRESET } };
  const preset = HORIZON_PRESETS.find((months) => String(months) === h);
  if (preset !== undefined) return { ok: true, choice: { kind: "months", months: preset } };
  const bounds = customEndBounds(today);
  if (
    h === CUSTOM &&
    end !== undefined &&
    isCalendarDate(end) &&
    end >= bounds.min &&
    end <= bounds.max
  ) {
    return { ok: true, choice: { kind: "custom", endDate: end } };
  }
  return { ok: false, error: messageRef("horizonInvalid", bounds) };
}
