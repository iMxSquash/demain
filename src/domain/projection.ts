// Daily balance projection (DOMAIN invariants 8 and 9, ADR-011): the real transactions plus the
// explicitly planned items still expected, and nothing else. Pure: "today" and the data are
// arguments, nothing reads a clock or a store.

import { addDays } from "./calendar-date";
import type { ResolvedOccurrence } from "./occurrence-resolution";
import type { DateRange } from "./recurrence";

export interface ProjectionAccount {
  id: number;
  currency: string;
  openingDate: string;
  openingBalance: number;
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

// Only what is still expected counts: a settled, overdue or cancelled occurrence has no remaining.
const PROJECTED_STATUSES: ReadonlySet<ResolvedOccurrence["status"]> = new Set(["planned", "partial"]);

function occurrenceFlows(item: PlannedItemOccurrences, occurrence: ResolvedOccurrence, today: string): ProjectionFlow[] {
  // A past date that is still unsettled has not happened yet: it is expected from today on.
  const date = occurrence.date < today ? today : occurrence.date;
  const source: FlowSource = {
    kind: "occurrence",
    plannedItemId: item.plannedItemId,
    nominalDate: occurrence.nominalDate,
  };

  if (item.kind !== "transfer") {
    return [{ accountId: item.accountId, date, amount: occurrence.remaining, source }];
  }
  if (item.destinationAccountId === null) {
    throw new Error(`Planned transfer ${item.plannedItemId} has no destination account`);
  }
  // A transfer moves its absolute amount whatever the sign it is stored with.
  const moved = Math.abs(occurrence.remaining);
  return [
    { accountId: item.accountId, date, amount: -moved, source },
    { accountId: item.destinationAccountId, date, amount: moved, source },
  ];
}

export function plannedFlows(items: readonly PlannedItemOccurrences[], today: string): ProjectionFlow[] {
  return items.flatMap((item) =>
    item.occurrences
      .filter((occurrence) => PROJECTED_STATUSES.has(occurrence.status) && occurrence.remaining !== 0)
      .flatMap((occurrence) => occurrenceFlows(item, occurrence, today)),
  );
}

export function projectDailyBalances(
  accounts: readonly ProjectionAccount[],
  flows: readonly ProjectionFlow[],
  range: DateRange,
): DailyBalance[] {
  const totals = new Map<number, number>(accounts.map((account) => [account.id, 0]));
  // One sort, then a running total per account: each flow is applied once whatever the range length.
  const sortedFlows = flows
    .filter((flow) => totals.has(flow.accountId))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const days: DailyBalance[] = [];
  let next = 0;
  for (let date = range.from; date <= range.to; date = addDays(date, 1)) {
    for (; next < sortedFlows.length && sortedFlows[next]!.date <= date; next++) {
      const flow = sortedFlows[next]!;
      totals.set(flow.accountId, (totals.get(flow.accountId) ?? 0) + flow.amount);
    }
    const balances = new Map<number, number>();
    for (const account of accounts) {
      if (account.openingDate <= date) {
        balances.set(account.id, account.openingBalance + (totals.get(account.id) ?? 0));
      }
    }
    days.push({ date, balances });
  }
  return days;
}

export function firstDayBelowZero(days: readonly DailyBalance[], accountIds: readonly number[]): string | null {
  for (const day of days) {
    let sum = 0;
    for (const accountId of accountIds) {
      sum += day.balances.get(accountId) ?? 0;
    }
    if (sum < 0) return day.date;
  }
  return null;
}
