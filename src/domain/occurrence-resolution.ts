// Status of each occurrence of a planned item, from its linked transactions (DOMAIN, "Planned vs
// actual"). Pure: "today", the links and the item are arguments, nothing reads a clock or a store.

import { addDays } from "./calendar-date";
import {
  generateOccurrences,
  type Occurrence,
  type OccurrenceOverride,
  type PlannedSchedule,
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
  /** Fixed amount here; the rolling average in #163; the override amount always wins. */
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

export function resolveOccurrences(
  item: ResolutionItem,
  links: readonly OccurrenceLink[],
  range: DateRange,
  today: string,
): ResolvedOccurrence[] {
  const linksByOccurrence = Map.groupBy(links, (link) => link.occurrenceDate);
  const resolveStatus = item.acceptsMultipleTransactions ? resolveMultiTransactionStatus : resolveRegularStatus;
  const occurrences = generateOccurrences(item.schedule, item.overrides, range, today).sort((a, b) =>
    a.nominalDate < b.nominalDate ? -1 : a.nominalDate > b.nominalDate ? 1 : 0,
  );

  // One ordered pass over nominal dates: the rolling average (#163) needs each occurrence to see
  // the ones before it.
  const resolved: ResolvedOccurrence[] = [];
  for (const occurrence of occurrences) {
    const occurrenceLinks = linksByOccurrence.get(occurrence.nominalDate) ?? [];
    const status = resolveStatus(occurrence, occurrenceLinks.length > 0, item.matchWindowDays, today);
    resolved.push({
      ...occurrence,
      expectedAmount: occurrence.amount,
      links: occurrenceLinks,
      linkedSum: occurrenceLinks.reduce((sum, link) => sum + link.amount, 0),
      remaining: status === "confirmed" ? 0 : occurrence.amount,
      status,
    });
  }
  return resolved;
}

// The bounds come from the links so that an unbounded schedule is never enumerated. Overrides are
// left out on purpose: they never add or remove a nominal date, they only move its effective date.
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
