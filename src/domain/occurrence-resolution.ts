// Status of each occurrence of a planned item, from its linked transactions (DOMAIN, "Planned vs
// actual"). Pure: "today", the links and the item are arguments, nothing reads a clock or a store.

import { addDays } from "./calendar-date";
import { divideRound } from "./money";
import {
  generateOccurrences,
  type Occurrence,
  type OccurrenceOverride,
  type PlannedSchedule,
  type PlannedVersion,
} from "./occurrences";
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
  /** What is still expected: 0 once settled, otherwise expectedAmount (provisions in #164). */
  remaining: number;
  status: OccurrenceStatus;
}

// A business-day rule moves a date by two days at most (weekend to the previous or next weekday).
const BUSINESS_DAY_SHIFT_MARGIN_DAYS = 2;

function resolveRegularStatus(
  occurrence: Occurrence,
  hasLinks: boolean,
  matchWindowDays: number,
  today: string,
): OccurrenceStatus {
  // A settled occurrence stays confirmed even if it is cancelled afterwards: confirmed wins.
  if (hasLinks) return "confirmed";
  if (occurrence.isCancelled) return "cancelled";
  return today > addDays(occurrence.date, matchWindowDays) ? "overdue" : "planned";
}

// Regular behaviour until #164 replaces it with the provision rules (partial settlement).
const resolveMultiTransactionStatus = resolveRegularStatus;

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
    return divideRound(window.reduce((sum, value) => sum + value, 0), window.length);
  }

  add(versionIndex: number, value: number): void {
    this.valuesByVersion.set(versionIndex, [...(this.valuesByVersion.get(versionIndex) ?? []), value]);
  }
}

// The version in effect on a date: the last one that started on or before it, else the first.
function versionInEffect(schedule: PlannedSchedule, date: string): PlannedVersion | undefined {
  return schedule.versions.findLast((version) => version.effectiveFrom <= date) ?? schedule.versions[0];
}

// The pass must start where the window of the first occurrence of the range starts, so a rolling
// average version is enumerated from its effective date. A fixed version needs nothing before the range.
function passRange(schedule: PlannedSchedule, range: DateRange): DateRange {
  const current = versionInEffect(schedule, range.from);
  if (current?.amountMode !== "rolling_average") return range;
  const windowStart = addDays(current.effectiveFrom, -BUSINESS_DAY_SHIFT_MARGIN_DAYS);
  return { from: windowStart < range.from ? windowStart : range.from, to: range.to };
}

export function resolveOccurrences(
  item: ResolutionItem,
  links: readonly OccurrenceLink[],
  range: DateRange,
  today: string,
): ResolvedOccurrence[] {
  const linksByOccurrence = Map.groupBy(links, (link) => link.occurrenceDate);
  const resolveStatus = item.acceptsMultipleTransactions ? resolveMultiTransactionStatus : resolveRegularStatus;
  // generateOccurrences orders by effective date, which an override can move out of nominal order.
  const occurrences = generateOccurrences(item.schedule, item.overrides, passRange(item.schedule, range), today).sort(
    (a, b) => (a.nominalDate < b.nominalDate ? -1 : a.nominalDate > b.nominalDate ? 1 : 0),
  );

  // One ordered pass over nominal dates: the rolling average needs each occurrence to see the ones
  // before it, including those before the range.
  const average = new RollingAverageState(item.schedule.versions);
  const resolved: ResolvedOccurrence[] = [];
  for (const occurrence of occurrences) {
    const occurrenceLinks = linksByOccurrence.get(occurrence.nominalDate) ?? [];
    const linkedSum = occurrenceLinks.reduce((sum, link) => sum + link.amount, 0);
    const status = resolveStatus(occurrence, occurrenceLinks.length > 0, item.matchWindowDays, today);

    let expectedAmount = occurrence.amount;
    if (item.schedule.versions[occurrence.versionIndex]?.amountMode === "rolling_average") {
      const estimate = average.estimate(occurrence.versionIndex);
      if (!occurrence.isAmountOverridden) expectedAmount = estimate;
      // A settled occurrence feeds the average with what was paid, a planned one with the estimate
      // it would have had without an override. Cancelled and overdue ones are not payments.
      if (status === "confirmed") average.add(occurrence.versionIndex, linkedSum);
      else if (status === "planned") average.add(occurrence.versionIndex, estimate);
    }

    if (occurrence.date < range.from || occurrence.date > range.to) continue;
    resolved.push({
      ...occurrence,
      expectedAmount,
      links: occurrenceLinks,
      linkedSum,
      remaining: status === "confirmed" ? 0 : expectedAmount,
      status,
    });
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
export function findOrphanLinks(item: ResolutionItem, links: readonly OccurrenceLink[], today: string): OccurrenceLink[] {
  if (links.length === 0) return [];
  const produced = new Set(
    generateOccurrences(item.schedule, [], boundsAroundLinks(links), today).map(
      ({ nominalDate }) => nominalDate,
    ),
  );
  return links.filter((link) => !produced.has(link.occurrenceDate));
}
