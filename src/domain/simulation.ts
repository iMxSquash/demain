// The evaluation of a simulation (DOMAIN, Scenario evaluation pipeline): the real trajectory, plus
// the estimated variable spending (step 1), plus the modifications of the scenario (step 2). The
// constant-pace simulation is a scenario with no modification. Estimation exists only here, never
// in the real views (ADR-011). Pure: "today" and the data are arguments.

import type { AccountKind } from "./account";
import {
  applyFlowModifications,
  balanceAwareSteps,
  type Modification,
  type ModificationContext,
  type ModificationProblem,
} from "./modification";
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
  /**
   * The categories that exist, to check the references of modifications (D6). Without it, every
   * categorized modification is invalid; the constant-pace simulation does not need it.
   */
  categoryIds?: ReadonlySet<number>;
  /** The kind of each account. Without it, every savings goal is invalid (D6). */
  accountKinds?: ReadonlyMap<number, AccountKind>;
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

/** What a savings goal did over the range (D8). */
export interface GoalOutcome {
  modificationId: number;
  /** The monthly amount used (the given one, or the inverse one from #227). */
  monthlyAmount: number;
  /** Routing of each transfer, from the `simulatedTransfers` of the projection with this modification as source. */
  transfers: SimulatedTransferRouting[];
  /** What stayed in the source account: the unplaced part of each transfer, all of an invalid one. */
  unplacedTotal: number;
  /** A monthly goal is always "applied"; the other statuses belong to the target mode (#227). */
  status: "applied" | "reached" | "alreadyReached" | "unreachable";
}

function unplacedOf({ amount, routing }: SimulatedTransferRouting): number {
  return routing.status === "ok" ? routing.unplaced : amount;
}

/** One outcome per valid goal in monthly mode, in the order the goals applied (D5). */
function goalOutcomes(
  applied: readonly Modification[],
  simulatedTransfers: readonly SimulatedTransferRouting[],
): GoalOutcome[] {
  const outcomes: GoalOutcome[] = [];
  for (const modification of applied) {
    if (modification.type !== "savings_goal" || modification.parameters.mode.kind !== "monthly")
      continue;
    const { id } = modification;
    const transfers = simulatedTransfers.filter(
      ({ source }) => source.kind === "modification" && source.modificationId === id,
    );
    outcomes.push({
      modificationId: id,
      monthlyAmount: modification.parameters.mode.amount,
      transfers,
      unplacedTotal: transfers.reduce((total, transfer) => total + unplacedOf(transfer), 0),
      status: "applied",
    });
  }
  return outcomes;
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
  // A transfer between the user's accounts never carries a category (DOMAIN, Transaction).
  const leg = (accountId: number, amount: number): SimulatedFlow => ({
    accountId,
    date,
    amount,
    source,
    categoryId: null,
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
 * Evaluates a scenario on the one balance loop of the projection: real flows, planned occurrences,
 * the estimates, then the flows of stage A of each day (DOMAIN, D5). Simulated flows never join
 * the real flows. An invalid modification is reported in `problems` and adds nothing (D6).
 */
export function evaluateScenario(
  input: SimulationInput,
  modifications: readonly Modification[],
): SimulationResult & { problems: ModificationProblem[]; goals: GoalOutcome[] } {
  const { accounts, realFlows, itemCategories, today, range } = input;
  const context: ModificationContext = {
    accounts,
    items: input.items,
    itemCategories,
    categoryIds: input.categoryIds ?? new Set(),
    accountKinds: input.accountKinds ?? new Map(),
    today,
    range,
  };
  const {
    items,
    flows: simulatedFlows,
    problems,
    applied: appliedModifications,
  } = applyFlowModifications(
    { items: [...input.items], flows: input.estimates.map(estimateFlow) },
    modifications,
    context,
  );
  const { days, transfers, simulatedTransfers } = projectWithRouting(
    accounts,
    realFlows,
    items,
    today,
    range,
    { simulatedFlows, steps: balanceAwareSteps(modifications, context) },
  );

  const routings = new Map(
    transfers.map((transfer) => [
      transferKey(transfer.plannedItemId, transfer.nominalDate),
      transfer,
    ]),
  );
  // The loop applies nothing when the range is empty, and nothing after its last day.
  const applied = orderedEvents(realFlows, items, today, simulatedFlows).filter(
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
  const goals = goalOutcomes(appliedModifications, simulatedTransfers);
  return { days, transfers, simulatedTransfers, flows, problems, goals };
}

/** The constant-pace simulation: the scenario with no modification. */
export function evaluateConstantPace(input: SimulationInput): SimulationResult {
  const { days, transfers, simulatedTransfers, flows } = evaluateScenario(input, []);
  return { days, transfers, simulatedTransfers, flows };
}
