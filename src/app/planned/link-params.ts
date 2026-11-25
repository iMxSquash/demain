import { isCalendarDate } from "../../domain/account";
import { parseWholeNumber } from "../../domain/amount-syntax";
import type { LinkFilters, OccurrenceRef } from "../../ledger/planned-matching";

type SearchParam = string | string[] | undefined;

/** The calendar view a "Link a transaction" page goes back to. */
export type CalendarBackView = "grid" | "lines";

export const LINK_ROUTE = "/planned/link";

// A bound the user cleared lists everything on that side.
const NO_LOWER_BOUND = "0001-01-01";
const NO_UPPER_BOUND = "9999-12-31";

const single = (value: SearchParam): string | undefined => (typeof value === "string" ? value : undefined);

/** The page of an occurrence: `item` and `date` name it, `back` the view the user came from. */
export function linkHref({ plannedItemId, nominalDate }: OccurrenceRef, back: CalendarBackView): string {
  return `${LINK_ROUTE}?${new URLSearchParams({ item: String(plannedItemId), date: nominalDate, back })}`;
}

/** The view and the month the page returns to; the grid unless the line view is named. */
export function calendarHref(back: CalendarBackView, month: string): string {
  return `${back === "lines" ? "/calendar/lines" : "/calendar"}?${new URLSearchParams({ month })}`;
}

export function parseBackView(value: unknown): CalendarBackView {
  return value === "lines" ? "lines" : "grid";
}

/** Null when the browser sent anything but an item id and a date. */
export function parseOccurrenceRef(item: unknown, date: unknown): OccurrenceRef | null {
  if (typeof item !== "string" || typeof date !== "string") return null;
  const plannedItemId = parseWholeNumber(item);
  if (plannedItemId === null || plannedItemId < 1 || !Number.isSafeInteger(plannedItemId)) return null;
  return isCalendarDate(date) ? { plannedItemId, nominalDate: date } : null;
}

// Absent or invalid: the window of the occurrence decides. Cleared: no bound on that side.
function boundOf(value: SearchParam, unbounded: string): string | null {
  const text = single(value);
  if (text === undefined) return null;
  if (text.trim() === "") return unbounded;
  return isCalendarDate(text) ? text : null;
}

/** The filters of the page; the ledger fills a bound the user did not set with the occurrence window. */
export function parseLinkFilters(params: Record<string, SearchParam>): Required<LinkFilters> {
  const from = boundOf(params.from, NO_LOWER_BOUND);
  const to = boundOf(params.to, NO_UPPER_BOUND);
  return {
    search: single(params.q)?.trim() ?? "",
    range: { ...(from === null ? {} : { from }), ...(to === null ? {} : { to }) },
  };
}

/** A bound shown in its field: empty when it is open. */
export function shownBound(date: string): string {
  return date === NO_LOWER_BOUND || date === NO_UPPER_BOUND ? "" : date;
}
