// Status of each occurrence of a planned item, from its linked transactions (DOMAIN, "Planned vs
// actual"). Pure: "today", the links and the item are arguments, nothing reads a clock or a store.

import { addDays } from "./calendar-date";
import { divideRound } from "./money";
import {
  generateOccurrences,
  MAX_BUSINESS_DAY_SHIFT_DAYS,
  type Occurrence,
  type OccurrenceOverride,
  type PlannedSchedule,
  type PlannedVersion,
} from "./occurrences";
import { provisionPeriod } from "./provision";
import type { DateRange } from "./recurrence";

export type OccurrenceStatus = "planned" | "partial" | "confirmed" | "overdue" | "cancelled";

export interface OccurrenceLink {
  transactionId: number;
  /** The nominal date of the occurrence the transaction settles (transactions.occurrence_date). */
  occurrenceDate: string;
  date: string;
  amount: number;
}

export interface ResolutionItem {
  schedule: PlannedSchedule;
  overrides: readonly OccurrenceOverride[];
  matchWindowDays: number;
  acceptsMultipleTransactions: boolean;
}

export interface ResolvedOccurrence extends Occurrence {
  /**
   * The amount expected: the version amount, or the rolling average of the previous values of its
   * version. The override amount always wins.
   */
  expectedAmount: number;
  links: OccurrenceLink[];
  linkedSum: number;
  /**
   * What is still expected: 0 once settled, otherwise expectedAmount. For a provision, what the
   * linked sum leaves of expectedAmount, with its sign and never past zero, and 0 once its period
   * has passed.
   */
  remaining: number;
  /** `partial` is only produced for a provision, which accepts several transactions. */
  status: OccurrenceStatus;
  /** The period a provision settles; null for a regular occurrence. */
  period: DateRange | null;
}

// A business-day rule moves a date by two days at most (weekend to the previous or next weekday).
const BUSINESS_DAY_SHIFT_MARGIN_DAYS = MAX_BUSINESS_DAY_SHIFT_DAYS;

interface Resolution {
  status: OccurrenceStatus;
  remaining: number;
}

function resolveRegular(
  expectedAmount: number,
  matchWindowDays: number,
  date: string,
  today: string,
): Resolution {
  const status = today > addDays(date, matchWindowDays) ? "overdue" : "planned";
  return { status, remaining: expectedAmount };
}

// A link of the opposite sign to the expected amount does not reduce what is left: the leftover is
// bounded by the expected amount, never above it.
export function provisionRemaining(expectedAmount: number, linkedSum: number): number {
  const direction = Math.sign(expectedAmount);
  const covered = Math.max(0, direction * linkedSum);
  const left = Math.max(0, Math.abs(expectedAmount) - covered);
  // `direction * 0` would be -0 for an expense.
  return left === 0 ? 0 : direction * left;
}

// A provision is settled by its linked sum or by the end of its period (the leftover then
// disappears), and is overdue when its period ends without any transaction. The window of matching
// does not apply: the period is what bounds the transactions.
function resolveProvision(
  expectedAmount: number,
  linkedSum: number,
  hasLinks: boolean,
  period: DateRange,
  today: string,
): Resolution {
  const isPeriodOver = today > period.to;
  if (!hasLinks) {
    return isPeriodOver
      ? { status: "overdue", remaining: 0 }
      : { status: "planned", remaining: expectedAmount };
  }
  const remaining = isPeriodOver ? 0 : provisionRemaining(expectedAmount, linkedSum);
  return { status: remaining === 0 ? "confirmed" : "partial", remaining };
}

// The window of the average is per version: a new version restarts it (DOMAIN, "Amount of an occurrence").
class RollingAverageState {
  private readonly valuesByVersion = new Map<number, number[]>();

  constructor(private readonly versions: readonly PlannedVersion[]) {}

  /** The average of the last `averageWindow` values of the version, or its starting estimate. */
  estimate(versionIndex: number): number {
    const version = this.versions[versionIndex];
    if (version === undefined) throw new Error(`No version at index ${versionIndex}`);
    const window = (this.valuesByVersion.get(versionIndex) ?? []).slice(-version.averageWindow);
    if (window.length === 0) return version.amount;
    return divideRound(
      window.reduce((sum, value) => sum + value, 0),
      window.length,
    );
  }

  add(versionIndex: number, value: number): void {
    this.valuesByVersion.set(versionIndex, [
      ...(this.valuesByVersion.get(versionIndex) ?? []),
      value,
    ]);
  }
}

// The version in effect on a date: the last one that started on or before it, else the first.
function versionInEffect(schedule: PlannedSchedule, date: string): PlannedVersion | undefined {
  return (
    schedule.versions.findLast((version) => version.effectiveFrom <= date) ?? schedule.versions[0]
  );
}

// The pass must start where the window of the first occurrence of the range starts, so a rolling
// average version is enumerated from its effective date, and a provision from the start of its
// schedule. A fixed version of a regular item needs nothing before the range.
function passRange(item: ResolutionItem, range: DateRange): DateRange {
  const { schedule } = item;
  // A provision needs the occurrence before the first of the range to know where its period starts.
  const current = item.acceptsMultipleTransactions
    ? schedule.versions[0]
    : versionInEffect(schedule, range.from);
  const needsEarlierOccurrences =
    item.acceptsMultipleTransactions || current?.amountMode === "rolling_average";
  if (current === undefined || !needsEarlierOccurrences) return range;
  const windowStart = addDays(current.effectiveFrom, -BUSINESS_DAY_SHIFT_MARGIN_DAYS);
  return { from: windowStart < range.from ? windowStart : range.from, to: range.to };
}

// A provision whose version has no repetition has no period and is resolved as a regular occurrence.
function periodOfProvision(
  occurrence: Occurrence,
  previous: Occurrence | undefined,
  version: PlannedVersion | undefined,
): DateRange | null {
  if (!version?.repetition) return null;
  // The previous occurrence of the same schedule bounds the period, whatever version it had.
  return provisionPeriod(occurrence.nominalDate, previous?.nominalDate ?? null, version.repetition);
}

const noPeriod = (): null => null;

interface OccurrenceState {
  occurrence: Occurrence;
  expectedAmount: number;
  linkedSum: number;
  hasLinks: boolean;
  /** Null for a regular occurrence. */
  period: DateRange | null;
  matchWindowDays: number;
  today: string;
}

function resolveOccurrence(state: OccurrenceState): Resolution {
  const { occurrence, expectedAmount, linkedSum, hasLinks, period, matchWindowDays, today } = state;
  // A settled occurrence stays confirmed even if it is cancelled afterwards: confirmed wins.
  if (!hasLinks && occurrence.isCancelled)
    return { status: "cancelled", remaining: expectedAmount };
  if (period !== null) return resolveProvision(expectedAmount, linkedSum, hasLinks, period, today);
  if (hasLinks) return { status: "confirmed", remaining: 0 };
  return resolveRegular(expectedAmount, matchWindowDays, occurrence.date, today);
}

// A settled occurrence feeds the average with what was paid, a planned or partial one with the
// estimate it would have had without an override. Cancelled and overdue ones are not payments.
function feedAverage(
  average: RollingAverageState,
  versionIndex: number,
  status: OccurrenceStatus,
  linkedSum: number,
  estimate: number,
): void {
  if (status === "confirmed") average.add(versionIndex, linkedSum);
  else if (status === "planned" || status === "partial") average.add(versionIndex, estimate);
}

export function resolveOccurrences(
  item: ResolutionItem,
  links: readonly OccurrenceLink[],
  range: DateRange,
  today: string,
): ResolvedOccurrence[] {
  const linksByOccurrence = Map.groupBy(links, (link) => link.occurrenceDate);
  // generateOccurrences orders by effective date, which an override can move out of nominal order.
  const occurrences = generateOccurrences(
    item.schedule,
    item.overrides,
    passRange(item, range),
    today,
  ).sort((a, b) => (a.nominalDate < b.nominalDate ? -1 : a.nominalDate > b.nominalDate ? 1 : 0));

  // One ordered pass over nominal dates: the rolling average needs each occurrence to see the ones
  // before it, including those before the range.
  const average = new RollingAverageState(item.schedule.versions);
  // The strategy depends on the item alone, so it is chosen once.
  const periodOf = item.acceptsMultipleTransactions ? periodOfProvision : noPeriod;
  const resolved: ResolvedOccurrence[] = [];
  for (const [index, occurrence] of occurrences.entries()) {
    const version = item.schedule.versions[occurrence.versionIndex];
    const occurrenceLinks = linksByOccurrence.get(occurrence.nominalDate) ?? [];
    const linkedSum = occurrenceLinks.reduce((sum, link) => sum + link.amount, 0);
    const hasLinks = occurrenceLinks.length > 0;

    const isRollingAverage = version?.amountMode === "rolling_average";
    const estimate = isRollingAverage ? average.estimate(occurrence.versionIndex) : null;
    const expectedAmount =
      estimate !== null && !occurrence.isAmountOverridden ? estimate : occurrence.amount;

    const period = periodOf(occurrence, occurrences[index - 1], version);
    const { status, remaining } = resolveOccurrence({
      occurrence,
      expectedAmount,
      linkedSum,
      hasLinks,
      period,
      matchWindowDays: item.matchWindowDays,
      today,
    });

    if (estimate !== null)
      feedAverage(average, occurrence.versionIndex, status, linkedSum, estimate);

    if (occurrence.date >= range.from && occurrence.date <= range.to) {
      resolved.push({
        ...occurrence,
        expectedAmount,
        links: occurrenceLinks,
        linkedSum,
        remaining,
        status,
        period,
      });
    }
  }
  return resolved;
}

// The bounds come from the links so that an unbounded schedule is never enumerated. Overrides are
// left out on purpose: they never add or remove a nominal date, they only move its effective date.
// Requires a non-empty list, which findOrphanLinks guarantees.
function boundsAroundLinks(links: readonly OccurrenceLink[]): DateRange {
  const dates = links.map((link) => link.occurrenceDate);
  const first = dates.reduce((min, date) => (date < min ? date : min));
  const last = dates.reduce((max, date) => (date > max ? date : max));
  // addDays leaves a date unchanged at the edge of the supported years, so the margin cannot overflow.
  return {
    from: addDays(first, -BUSINESS_DAY_SHIFT_MARGIN_DAYS),
    to: addDays(last, BUSINESS_DAY_SHIFT_MARGIN_DAYS),
  };
}

/**
 * The links whose nominal date no occurrence of the schedule has. A link on a date after the
 * cancellation of the item is reported too, since a cancelled schedule produces nothing after today.
 */
export function findOrphanLinks(
  item: ResolutionItem,
  links: readonly OccurrenceLink[],
  today: string,
): OccurrenceLink[] {
  if (links.length === 0) return [];
  const produced = new Set(
    generateOccurrences(item.schedule, [], boundsAroundLinks(links), today).map(
      ({ nominalDate }) => nominalDate,
    ),
  );
  return links.filter((link) => !produced.has(link.occurrenceDate));
}
