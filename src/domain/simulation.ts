// The constant-pace simulation (DOMAIN, Scenario evaluation pipeline, step 1): the real trajectory
// plus the estimated variable spending, with no modification. Estimation exists only here, never
// in the real views (ADR-011). Pure: "today" and the data are arguments.

import {
  orderedEvents,
  projectWithRouting,
  type DailyBalance,
  type PlannedItemOccurrences,
  type PlannedTransferRouting,
  type ProjectionAccount,
  type ProjectionEvent,
  type ProjectionFlow,
  type SimulatedTransferRouting,
} from "./projection";
import type { DateRange } from "./recurrence";
import type { EstimatedFlow } from "./variable-estimate";

export interface SimulatedFlow extends ProjectionFlow {
  categoryId: number | null;
  /** False for a leg of a transfer between the user's accounts. */
  external: boolean;
}

export interface SimulationInput {
  accounts: readonly ProjectionAccount[];
  /** Real transactions up to today, as flows. */
  realFlows: readonly SimulatedFlow[];
  items: readonly PlannedItemOccurrences[];
  /** Category of each planned item, for the diagrams. */
  itemCategories: ReadonlyMap<number, number | null>;
  estimates: readonly EstimatedFlow[];
  today: string;
  range: DateRange;
}

export interface SimulationResult {
  days: DailyBalance[];
  transfers: PlannedTransferRouting[];
  simulatedTransfers: SimulatedTransferRouting[];
  /** Every flow applied, real, planned, estimated or simulated, with its source, in application order. */
  flows: SimulatedFlow[];
}

function estimateFlow({ accountId, categoryId, date, amount }: EstimatedFlow): SimulatedFlow {
  return {
    accountId,
    date,
    amount,
    source: { kind: "estimate", categoryId },
    categoryId,
    external: true,
  };
}

function transferKey(plannedItemId: number, nominalDate: string): string {
  return `${plannedItemId}:${nominalDate}`;
}

/** The flows a planned occurrence actually applied: a transfer gives two legs per placement. */
function plannedFlowsApplied(
  event: Extract<ProjectionEvent, { kind: "planned" }>,
  categoryId: number | null,
  routings: ReadonlyMap<string, PlannedTransferRouting>,
): SimulatedFlow[] {
  const { item, occurrence, date } = event;
  const source = {
    kind: "occurrence",
    plannedItemId: item.plannedItemId,
    nominalDate: occurrence.nominalDate,
  } as const;
  if (item.kind !== "transfer") {
    return [
      {
        accountId: item.accountId,
        date,
        amount: occurrence.remaining,
        source,
        categoryId,
        external: true,
      },
    ];
  }
  const leg = (accountId: number, amount: number): SimulatedFlow => ({
    accountId,
    date,
    amount,
    source,
    categoryId,
    external: false,
  });
  const transfer = routings.get(transferKey(item.plannedItemId, occurrence.nominalDate));
  // No routing recorded: the destination is outside the accounts, only the source was debited.
  if (transfer === undefined) return [leg(item.accountId, -Math.abs(occurrence.remaining))];
  if (transfer.routing.status !== "ok") return [];
  return transfer.routing.placements.flatMap(({ accountId, amount }) => [
    leg(item.accountId, -amount),
    leg(accountId, amount),
  ]);
}

/**
 * Evaluates the constant-pace simulation on the one balance loop of the projection: real flows,
 * planned occurrences, then the estimates of each day (DOMAIN, D5).
 */
export function evaluateConstantPace(input: SimulationInput): SimulationResult {
  const { accounts, realFlows, items, itemCategories, today, range } = input;
  const estimates = input.estimates.map(estimateFlow);
  const { days, transfers, simulatedTransfers } = projectWithRouting(
    accounts,
    realFlows,
    items,
    today,
    range,
    { simulatedFlows: estimates },
  );

  const routings = new Map(
    transfers.map((transfer) => [
      transferKey(transfer.plannedItemId, transfer.nominalDate),
      transfer,
    ]),
  );
  // The loop applies nothing when the range is empty, and nothing after its last day.
  const applied = orderedEvents(realFlows, items, today, estimates).filter(
    (event) => range.from <= range.to && event.date <= range.to,
  );
  // The loop skips the flows of accounts outside the list, so they are not reported either.
  const accountIds = new Set(accounts.map((account) => account.id));
  const flows = applied
    .flatMap((event) =>
      event.kind === "planned"
        ? plannedFlowsApplied(event, itemCategories.get(event.item.plannedItemId) ?? null, routings)
        : [event.flow],
    )
    .filter((flow) => accountIds.has(flow.accountId));
  return { days, transfers, simulatedTransfers, flows };
}
