// Daily balance projection (DOMAIN invariants 8 and 9, ADR-011): the real transactions plus the
// explicitly planned items still expected, and nothing else. Pure: "today" and the data are
// arguments, nothing reads a clock or a store.

import { addDays } from "./calendar-date";
import type { ResolvedOccurrence } from "./occurrence-resolution";
import {
  overflowChainProblem,
  routeAlongOverflowChain,
  type OverflowChainProblem,
  type OverflowRouting,
} from "./overflow";
import type { DateRange } from "./recurrence";

export interface ProjectionAccount {
  id: number;
  currency: string;
  openingDate: string;
  openingBalance: number;
  /** Maximum balance reachable through deposits, in minor units. */
  ceiling: number | null;
  overflowAccountId: number | null;
  archived: boolean;
}

export type FlowSource =
  | { kind: "transaction"; transactionId: number }
  | { kind: "occurrence"; plannedItemId: number; nominalDate: string };

export interface ProjectionFlow {
  accountId: number;
  date: string;
  amount: number;
  source: FlowSource;
}

export interface PlannedItemOccurrences {
  plannedItemId: number;
  kind: "expense" | "income" | "interest" | "transfer";
  accountId: number;
  destinationAccountId: number | null;
  occurrences: readonly ResolvedOccurrence[];
}

export interface DailyBalance {
  date: string;
  /** Balance of each account at the end of the day, in its own currency, minor units. */
  balances: ReadonlyMap<number, number>;
}

/** How one planned transfer was spread along the overflow chain of its destination. */
export interface PlannedTransferRouting {
  plannedItemId: number;
  nominalDate: string;
  /** Effective date of the transfer in the projection. */
  date: string;
  /** Absolute amount the transfer asked to move, in minor units. */
  amount: number;
  routing:
    | Extract<OverflowRouting, { status: "ok" }>
    | { status: "invalid"; reason: OverflowChainProblem };
}

// Only what is still expected counts: a settled, overdue or cancelled occurrence has no remaining.
const PROJECTED_STATUSES: ReadonlySet<ResolvedOccurrence["status"]> = new Set([
  "planned",
  "partial",
]);

function projectedOccurrences(item: PlannedItemOccurrences): ResolvedOccurrence[] {
  return item.occurrences.filter(
    (occurrence) => PROJECTED_STATUSES.has(occurrence.status) && occurrence.remaining !== 0,
  );
}

// A past date that is still unsettled has not happened yet: it is expected from today on.
function effectiveDate(occurrence: ResolvedOccurrence, today: string): string {
  return occurrence.date < today ? today : occurrence.date;
}

function transferDestination(item: PlannedItemOccurrences): number {
  if (item.destinationAccountId === null) {
    throw new Error(`Planned transfer ${item.plannedItemId} has no destination account`);
  }
  return item.destinationAccountId;
}

function occurrenceFlows(
  item: PlannedItemOccurrences,
  occurrence: ResolvedOccurrence,
  today: string,
): ProjectionFlow[] {
  const date = effectiveDate(occurrence, today);
  const source: FlowSource = {
    kind: "occurrence",
    plannedItemId: item.plannedItemId,
    nominalDate: occurrence.nominalDate,
  };

  if (item.kind !== "transfer") {
    return [{ accountId: item.accountId, date, amount: occurrence.remaining, source }];
  }
  const destinationAccountId = transferDestination(item);
  // A transfer moves its absolute amount whatever the sign it is stored with.
  const moved = Math.abs(occurrence.remaining);
  return [
    { accountId: item.accountId, date, amount: -moved, source },
    { accountId: destinationAccountId, date, amount: moved, source },
  ];
}

export function plannedFlows(
  items: readonly PlannedItemOccurrences[],
  today: string,
): ProjectionFlow[] {
  return items.flatMap((item) =>
    projectedOccurrences(item).flatMap((occurrence) => occurrenceFlows(item, occurrence, today)),
  );
}

function snapshotDay(
  accounts: readonly ProjectionAccount[],
  totals: ReadonlyMap<number, number>,
  date: string,
): DailyBalance {
  const balances = new Map<number, number>();
  for (const account of accounts) {
    if (account.openingDate <= date) {
      balances.set(account.id, account.openingBalance + (totals.get(account.id) ?? 0));
    }
  }
  return { date, balances };
}

export function projectDailyBalances(
  accounts: readonly ProjectionAccount[],
  flows: readonly ProjectionFlow[],
  range: DateRange,
): DailyBalance[] {
  const totals = new Map<number, number>(accounts.map((account) => [account.id, 0]));
  // Flows dated before the range still weigh on its first day, so they are bucketed there.
  // Each flow is then applied once, whatever the range length.
  const flowsByDay = new Map<string, ProjectionFlow[]>();
  for (const flow of flows) {
    if (!totals.has(flow.accountId)) continue;
    const day = flow.date < range.from ? range.from : flow.date;
    const bucket = flowsByDay.get(day) ?? [];
    bucket.push(flow);
    flowsByDay.set(day, bucket);
  }

  const days: DailyBalance[] = [];
  for (let date = range.from; date <= range.to; date = addDays(date, 1)) {
    for (const flow of flowsByDay.get(date) ?? []) {
      totals.set(flow.accountId, (totals.get(flow.accountId) ?? 0) + flow.amount);
    }
    days.push(snapshotDay(accounts, totals, date));
  }
  return days;
}

type ProjectionEvent =
  | { kind: "real"; date: string; flow: ProjectionFlow }
  | { kind: "planned"; date: string; item: PlannedItemOccurrences; occurrence: ResolvedOccurrence };

// ISO dates sort as plain strings.
function compareIsoDates(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function compareEvents(a: ProjectionEvent, b: ProjectionEvent): number {
  if (a.date !== b.date) return compareIsoDates(a.date, b.date);
  if (a.kind !== b.kind) return a.kind === "real" ? -1 : 1;
  if (a.kind === "real" || b.kind === "real") return 0;
  if (a.item.plannedItemId !== b.item.plannedItemId)
    return a.item.plannedItemId - b.item.plannedItemId;
  return compareIsoDates(a.occurrence.nominalDate, b.occurrence.nominalDate);
}

function buildEvents(
  realFlows: readonly ProjectionFlow[],
  items: readonly PlannedItemOccurrences[],
  today: string,
): ProjectionEvent[] {
  const real = realFlows.map((flow): ProjectionEvent => ({ kind: "real", date: flow.date, flow }));
  const planned = items.flatMap((item) =>
    projectedOccurrences(item).map((occurrence): ProjectionEvent => ({
      kind: "planned",
      date: effectiveDate(occurrence, today),
      item,
      occurrence,
    })),
  );
  // Array.prototype.sort is stable: real flows of the same day keep their input order.
  return [...real, ...planned].sort(compareEvents);
}

// An account missing from the list belongs to another currency or scope, so its flows are the caller's concern.
function addToTotal(totals: Map<number, number>, accountId: number, amount: number): void {
  const total = totals.get(accountId);
  if (total === undefined) return;
  totals.set(accountId, total + amount);
}

function routeTransfer(
  accounts: readonly ProjectionAccount[],
  totals: Map<number, number>,
  event: Extract<ProjectionEvent, { kind: "planned" }>,
  destinationId: number,
): PlannedTransferRouting["routing"] {
  const { item, occurrence } = event;
  const moved = Math.abs(occurrence.remaining);
  const problem = overflowChainProblem(destinationId, accounts);
  if (problem !== null) return { status: "invalid", reason: problem };

  const withBalances = accounts.map((account) => ({
    ...account,
    balance: account.openingBalance + (totals.get(account.id) ?? 0),
  }));
  const routing = routeAlongOverflowChain(moved, destinationId, withBalances);
  if (routing.status !== "ok") return routing;

  // The unplaced part never leaves the source account.
  addToTotal(
    totals,
    item.accountId,
    -routing.placements.reduce((sum, { amount }) => sum + amount, 0),
  );
  for (const { accountId, amount } of routing.placements) addToTotal(totals, accountId, amount);
  return routing;
}

function applyPlanned(
  accounts: readonly ProjectionAccount[],
  totals: Map<number, number>,
  event: Extract<ProjectionEvent, { kind: "planned" }>,
): PlannedTransferRouting | null {
  const { item, occurrence, date } = event;
  if (item.kind !== "transfer") {
    addToTotal(totals, item.accountId, occurrence.remaining);
    return null;
  }
  if (!Number.isSafeInteger(occurrence.remaining)) {
    throw new RangeError("The amount of a planned transfer must be an integer");
  }
  const destinationId = transferDestination(item);
  if (!accounts.some((account) => account.id === destinationId)) {
    addToTotal(totals, item.accountId, -Math.abs(occurrence.remaining));
    return null;
  }
  const routing = routeTransfer(accounts, totals, event, destinationId);
  return {
    plannedItemId: item.plannedItemId,
    nominalDate: occurrence.nominalDate,
    date,
    amount: Math.abs(occurrence.remaining),
    routing,
  };
}

/**
 * Like projectDailyBalances over real and planned flows, but a planned transfer is
 * spread along the overflow chain of its destination according to the balances
 * reached on its day (DOMAIN, deposit ceiling and overflow). Events are applied in one
 * global order, by real effective date; only the output days are bucketed on the range.
 * Events after `range.to` are not applied, so their transfers are not recorded.
 */
export function projectWithRouting(
  accounts: readonly ProjectionAccount[],
  realFlows: readonly ProjectionFlow[],
  items: readonly PlannedItemOccurrences[],
  today: string,
  range: DateRange,
): { days: DailyBalance[]; transfers: PlannedTransferRouting[] } {
  const events = buildEvents(realFlows, items, today);
  const totals = new Map<number, number>(accounts.map((account) => [account.id, 0]));
  const days: DailyBalance[] = [];
  const transfers: PlannedTransferRouting[] = [];

  let next = 0;
  for (let date = range.from; date <= range.to; date = addDays(date, 1)) {
    for (; next < events.length && events[next]!.date <= date; next += 1) {
      const event = events[next]!;
      if (event.kind === "real") {
        addToTotal(totals, event.flow.accountId, event.flow.amount);
        continue;
      }
      const transfer = applyPlanned(accounts, totals, event);
      if (transfer !== null) transfers.push(transfer);
    }
    days.push(snapshotDay(accounts, totals, date));
  }
  return { days, transfers };
}

export function firstDayBelowZero(
  days: readonly DailyBalance[],
  accountIds: readonly number[],
): string | null {
  for (const day of days) {
    let sum = 0;
    for (const accountId of accountIds) {
      sum += day.balances.get(accountId) ?? 0;
    }
    if (sum < 0) return day.date;
  }
  return null;
}

/**
 * The index of the lowest value among the months after `todayIndex`, the earliest one on a tie,
 * or null when no month is planned. The real months never count, even when they are lower: the
 * indicator is about what is still ahead.
 */
export function lowestPlannedIndex(values: readonly number[], todayIndex: number): number | null {
  let lowest: number | null = null;
  for (let index = todayIndex + 1; index < values.length; index += 1) {
    if (lowest === null || values[index]! < values[lowest]!) lowest = index;
  }
  return lowest;
}
