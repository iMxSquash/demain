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
  | { kind: "occurrence"; plannedItemId: number; nominalDate: string }
  | { kind: "estimate"; categoryId: number | null }
  | { kind: "modification"; modificationId: number };

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

/** A transfer between two of the user's accounts that a simulation adds from the running balances. */
export interface SimulatedTransfer {
  sourceAccountId: number;
  destinationAccountId: number;
  /** Positive minor units. */
  amount: number;
  date: string;
  source: FlowSource;
}

/**
 * Flows of a simulation that depend on the running balances (DOMAIN, D5 stage B). Both are called
 * once per day of the range only: the events before it are applied in one block on its first day.
 */
export interface BalanceAwareSteps {
  /** Called once per day, after every ordinary flow of the day; the transfers are routed in the order returned. */
  transfersOn(date: string, balances: ReadonlyMap<number, number>): readonly SimulatedTransfer[];
  /** Called once per day with the end-of-day balances, after the transfers; the flows are applied last (interest). */
  creditsOn(date: string, balances: ReadonlyMap<number, number>): readonly ProjectionFlow[];
}

/** How one simulated transfer was spread along the overflow chain of its destination. */
export interface SimulatedTransferRouting {
  source: FlowSource;
  date: string;
  amount: number;
  routing: PlannedTransferRouting["routing"];
}

export interface ProjectionSimulation {
  /** Future flows of a simulation, applied after the planned occurrences of their day, in the order given. */
  simulatedFlows?: readonly ProjectionFlow[];
  steps?: BalanceAwareSteps;
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

export type ProjectionEvent<F extends ProjectionFlow = ProjectionFlow> =
  | { kind: "real"; date: string; flow: F }
  | { kind: "planned"; date: string; item: PlannedItemOccurrences; occurrence: ResolvedOccurrence }
  | { kind: "simulated"; date: string; flow: F };

// Same-day order (DOMAIN, D5): real flows, planned occurrences, then simulated flows.
const EVENT_RANK: Readonly<Record<ProjectionEvent["kind"], number>> = {
  real: 0,
  planned: 1,
  simulated: 2,
};

// ISO dates sort as plain strings.
function compareIsoDates(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function compareEvents(a: ProjectionEvent, b: ProjectionEvent): number {
  if (a.date !== b.date) return compareIsoDates(a.date, b.date);
  if (a.kind !== b.kind) return EVENT_RANK[a.kind] - EVENT_RANK[b.kind];
  if (a.kind !== "planned" || b.kind !== "planned") return 0;
  if (a.item.plannedItemId !== b.item.plannedItemId)
    return a.item.plannedItemId - b.item.plannedItemId;
  return compareIsoDates(a.occurrence.nominalDate, b.occurrence.nominalDate);
}

/**
 * The events of a projection in the order `projectWithRouting` applies them, so that a caller can
 * list what was applied without restating that order.
 */
export function orderedEvents<F extends ProjectionFlow>(
  realFlows: readonly F[],
  items: readonly PlannedItemOccurrences[],
  today: string,
  simulatedFlows: readonly F[] = [],
): ProjectionEvent<F>[] {
  const real = realFlows.map((flow): ProjectionEvent<F> => ({
    kind: "real",
    date: flow.date,
    flow,
  }));
  const planned = items.flatMap((item) =>
    projectedOccurrences(item).map((occurrence): ProjectionEvent<F> => ({
      kind: "planned",
      date: effectiveDate(occurrence, today),
      item,
      occurrence,
    })),
  );
  const simulated = simulatedFlows.map((flow): ProjectionEvent<F> => ({
    kind: "simulated",
    date: flow.date,
    flow,
  }));
  // Array.prototype.sort is stable: real and simulated flows of the same day keep their input order.
  return [...real, ...planned, ...simulated].sort(compareEvents);
}

// An account missing from the list belongs to another currency or scope, so its flows are the caller's concern.
function addToTotal(totals: Map<number, number>, accountId: number, amount: number): void {
  const total = totals.get(accountId);
  if (total === undefined) return;
  totals.set(accountId, total + amount);
}

/**
 * Moves `moved` from the source along the overflow chain of the destination, from the running
 * balances: the one router of planned and simulated transfers (ADR-013). Null when the destination
 * is outside the accounts: the source is debited in full and nothing is routed.
 */
function routeTransfer(
  accounts: readonly ProjectionAccount[],
  totals: Map<number, number>,
  sourceAccountId: number,
  destinationId: number,
  moved: number,
): PlannedTransferRouting["routing"] | null {
  if (!Number.isSafeInteger(moved) || moved < 0) {
    throw new RangeError("The amount of a transfer must be a non-negative integer");
  }
  if (!accounts.some((account) => account.id === destinationId)) {
    addToTotal(totals, sourceAccountId, -moved);
    return null;
  }
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
    sourceAccountId,
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
  const moved = Math.abs(occurrence.remaining);
  const routing = routeTransfer(accounts, totals, item.accountId, transferDestination(item), moved);
  if (routing === null) return null;
  return {
    plannedItemId: item.plannedItemId,
    nominalDate: occurrence.nominalDate,
    date,
    amount: moved,
    routing,
  };
}

function applySteps(
  accounts: readonly ProjectionAccount[],
  totals: Map<number, number>,
  steps: BalanceAwareSteps,
  date: string,
): SimulatedTransferRouting[] {
  const routings: SimulatedTransferRouting[] = [];
  for (const transfer of steps.transfersOn(date, snapshotDay(accounts, totals, date).balances)) {
    const { sourceAccountId, destinationAccountId, amount, source } = transfer;
    const routing = routeTransfer(accounts, totals, sourceAccountId, destinationAccountId, amount);
    if (routing !== null) routings.push({ source, date, amount, routing });
  }
  // Credits are not routed: interest may leave a balance above its ceiling.
  for (const flow of steps.creditsOn(date, snapshotDay(accounts, totals, date).balances)) {
    addToTotal(totals, flow.accountId, flow.amount);
  }
  return routings;
}

/**
 * Like projectDailyBalances over real and planned flows, but a planned transfer is
 * spread along the overflow chain of its destination according to the balances
 * reached on its day (DOMAIN, deposit ceiling and overflow). Events are applied in one
 * global order, by real effective date; only the output days are bucketed on the range.
 * Events after `range.to` are not applied, so their transfers are not recorded.
 *
 * A simulation adds its future flows after the planned occurrences of their day, then
 * the balance-aware steps of each day of the range (DOMAIN, D5). Without it, nothing
 * estimated or simulated is applied (ADR-011).
 */
export function projectWithRouting(
  accounts: readonly ProjectionAccount[],
  realFlows: readonly ProjectionFlow[],
  items: readonly PlannedItemOccurrences[],
  today: string,
  range: DateRange,
  simulation: ProjectionSimulation = {},
): {
  days: DailyBalance[];
  transfers: PlannedTransferRouting[];
  simulatedTransfers: SimulatedTransferRouting[];
} {
  const { simulatedFlows = [], steps } = simulation;
  const events = orderedEvents(realFlows, items, today, simulatedFlows);
  const totals = new Map<number, number>(accounts.map((account) => [account.id, 0]));
  const days: DailyBalance[] = [];
  const transfers: PlannedTransferRouting[] = [];
  const simulatedTransfers: SimulatedTransferRouting[] = [];

  let next = 0;
  for (let date = range.from; date <= range.to; date = addDays(date, 1)) {
    for (; next < events.length && events[next]!.date <= date; next += 1) {
      const event = events[next]!;
      if (event.kind !== "planned") {
        addToTotal(totals, event.flow.accountId, event.flow.amount);
        continue;
      }
      const transfer = applyPlanned(accounts, totals, event);
      if (transfer !== null) transfers.push(transfer);
    }
    if (steps !== undefined) simulatedTransfers.push(...applySteps(accounts, totals, steps, date));
    days.push(snapshotDay(accounts, totals, date));
  }
  return { days, transfers, simulatedTransfers };
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
