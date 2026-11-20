// Occurrences of a planned item across its versions and overrides (DOMAIN, "Generating
// occurrences", steps 1 to 3). Pure: "today" and all data are arguments, nothing reads a clock.

import { addDays } from "./calendar-date";
import {
  adjustToBusinessDay,
  nominalDates,
  type BusinessDayRule,
  type DateRange,
  type Repetition,
} from "./recurrence";

export type AmountMode = "fixed" | "rolling_average";

export interface PlannedVersion {
  effectiveFrom: string;
  repetition: Repetition | null; // null: one-off event
  businessDayRule: BusinessDayRule;
  /** Signed minor units: the fixed amount, or the starting estimate of a rolling average. */
  amount: number;
  amountMode: AmountMode;
  averageWindow: number;
}

export interface PlannedSchedule {
  startDate: string;
  endDate: string | null;
  cancelled: boolean;
  /** Sorted by effectiveFrom; the first one is effective from startDate. */
  versions: readonly PlannedVersion[];
}

export type OverrideStatus = "cancelled" | "modified";

export interface OccurrenceOverride {
  nominalDate: string;
  status: OverrideStatus;
  overrideDate: string | null;
  overrideAmount: number | null;
}

export interface Occurrence {
  /** Identity of the occurrence: the date computed by the rule. */
  nominalDate: string;
  /** The date to show and to match: business-day rule applied, then the override date. */
  date: string;
  versionIndex: number;
  /** The amount of the version in effect on the nominal date, or the override amount. */
  amount: number;
  isAmountOverridden: boolean;
  isCancelled: boolean;
}

// The business-day rule moves a date by two days at most (a Sunday to the previous Friday). The
// nominal dates are enumerated this far outside the range so that one moved into it is found.
const MAX_BUSINESS_DAY_SHIFT_DAYS = 2;

function isSameRepetition(a: Repetition | null, b: Repetition | null): boolean {
  if (a === null || b === null) return a === b;
  switch (a.kind) {
    case "monthly_on_day":
      return b.kind === a.kind && b.day === a.day;
    case "every_n_months":
      return b.kind === a.kind && b.months === a.months;
    case "every_n_weeks":
      return b.kind === a.kind && b.weeks === a.weeks;
    case "monthly_on_last_day":
    case "quarterly":
    case "yearly":
      return b.kind === a.kind;
  }
}

// A version that changes the repetition restarts its series from its own effective date; one that
// only changes the amount keeps the phase of the series before it (owner's answer Q3).
function seriesAnchors(schedule: PlannedSchedule): string[] {
  const anchors: string[] = [];
  schedule.versions.forEach((version, index) => {
    const previous = schedule.versions[index - 1];
    const previousAnchor = anchors[index - 1];
    const continuesSeries =
      previous !== undefined && previousAnchor !== undefined && isSameRepetition(previous.repetition, version.repetition);
    anchors.push(continuesSeries ? previousAnchor : version.effectiveFrom);
  });
  return anchors;
}

function assertValidSchedule(schedule: PlannedSchedule): void {
  const [first] = schedule.versions;
  if (first === undefined) throw new Error("A planned schedule needs at least one version");
  if (first.effectiveFrom !== schedule.startDate) {
    throw new Error(`The first version must be effective from the start date ${schedule.startDate}`);
  }
}

interface RawOccurrence {
  nominalDate: string;
  versionIndex: number;
}

function enumerateNominalDates(schedule: PlannedSchedule, range: DateRange): RawOccurrence[] {
  const anchors = seriesAnchors(schedule);
  const raw: RawOccurrence[] = [];
  schedule.versions.forEach((version, versionIndex) => {
    const next = schedule.versions[versionIndex + 1];
    const spanEnd = next === undefined ? null : addDays(next.effectiveFrom, -1);
    const to = [range.to, spanEnd, schedule.endDate].reduce<string>(
      (earliest, bound) => (bound !== null && bound < earliest ? bound : earliest),
      range.to,
    );
    const from = version.effectiveFrom > range.from ? version.effectiveFrom : range.from;
    const anchor = anchors[versionIndex];
    if (anchor === undefined || from > to) return;
    for (const nominalDate of nominalDates(version.repetition, anchor, { from, to })) {
      raw.push({ nominalDate, versionIndex });
    }
  });
  return raw;
}

// The range of nominal dates to enumerate so that every occurrence whose effective date is inside
// `range` is found: the shift of the business-day rule, and the nominal date of each override that
// moves an occurrence to a date of the range (an override date has no bound).
function enumerationRange(range: DateRange, overrides: readonly OccurrenceOverride[]): DateRange {
  let { from, to } = {
    from: addDays(range.from, -MAX_BUSINESS_DAY_SHIFT_DAYS),
    to: addDays(range.to, MAX_BUSINESS_DAY_SHIFT_DAYS),
  };
  for (const { nominalDate, overrideDate } of overrides) {
    if (overrideDate === null || overrideDate < range.from || overrideDate > range.to) continue;
    if (nominalDate < from) from = nominalDate;
    if (nominalDate > to) to = nominalDate;
  }
  return { from, to };
}

function applyOverride(occurrence: Occurrence, override: OccurrenceOverride | undefined): Occurrence {
  if (override === undefined) return occurrence;
  if (override.status === "cancelled") return { ...occurrence, isCancelled: true };
  return {
    ...occurrence,
    date: override.overrideDate ?? occurrence.date,
    amount: override.overrideAmount ?? occurrence.amount,
    isAmountOverridden: override.overrideAmount !== null,
  };
}

function compareOccurrences(a: Occurrence, b: Occurrence): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  if (a.nominalDate === b.nominalDate) return 0;
  return a.nominalDate < b.nominalDate ? -1 : 1;
}

/**
 * The occurrences of a planned item whose effective date (business-day rule, then override date)
 * is inside `range`, sorted by date then nominal date. A cancelled schedule keeps the occurrences
 * on or before `today`, flagged cancelled, and returns none after it. The amount is the version
 * amount or the override amount: the rolling average is not computed here.
 */
export function generateOccurrences(
  schedule: PlannedSchedule,
  overrides: readonly OccurrenceOverride[],
  range: DateRange,
  today: string,
): Occurrence[] {
  assertValidSchedule(schedule);
  const overrideByNominalDate = new Map(overrides.map((override) => [override.nominalDate, override]));

  return enumerateNominalDates(schedule, enumerationRange(range, overrides))
    .filter(({ nominalDate }) => !schedule.cancelled || nominalDate <= today)
    .map(({ nominalDate, versionIndex }) => {
      const version = schedule.versions[versionIndex];
      if (version === undefined) throw new Error(`Missing version ${versionIndex}`);
      const occurrence: Occurrence = {
        nominalDate,
        date: adjustToBusinessDay(nominalDate, version.businessDayRule),
        versionIndex,
        amount: version.amount,
        isAmountOverridden: false,
        isCancelled: schedule.cancelled,
      };
      return applyOverride(occurrence, overrideByNominalDate.get(nominalDate));
    })
    .filter(({ date }) => date >= range.from && date <= range.to)
    .sort(compareOccurrences);
}
