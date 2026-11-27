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
  type SavingsGoal,
  type StageAState,
} from "./modification";
import { overflowChainAccounts } from "./overflow";
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
  /** The monthly amount used: the given one, or the one the target mode found (0 when it moves nothing). */
  monthlyAmount: number;
  /** Routing of each transfer, from the `simulatedTransfers` of the projection with this modification as source. */
  transfers: SimulatedTransferRouting[];
  /** What stayed in the source account: the unplaced part of each transfer, all of an invalid one. */
  unplacedTotal: number;
  /** A monthly goal is always "applied"; the other statuses belong to the target mode (D8). */
  status: "applied" | "reached" | "alreadyReached" | "unreachable";
}

function unplacedOf({ amount, routing }: SimulatedTransferRouting): number {
  return routing.status === "ok" ? routing.unplaced : amount;
}

/** How a goal in target mode was resolved (D8). Only a reached goal moves money. */
type GoalResolution = Pick<GoalOutcome, "monthlyAmount" | "status">;

const UNREACHABLE: GoalResolution = { monthlyAmount: 0, status: "unreachable" };

/** One outcome per valid goal, in the order the goals applied (D5). */
function goalOutcomes(
  applied: readonly Modification[],
  simulatedTransfers: readonly SimulatedTransferRouting[],
  resolutions: ReadonlyMap<number, GoalResolution>,
): GoalOutcome[] {
  const outcomes: GoalOutcome[] = [];
  for (const modification of applied) {
    if (modification.type !== "savings_goal") continue;
    const { id, parameters } = modification;
    const { monthlyAmount, status } =
      parameters.mode.kind === "monthly"
        ? { monthlyAmount: parameters.mode.amount, status: "applied" as const }
        : (resolutions.get(id) ?? UNREACHABLE);
    const transfers = simulatedTransfers.filter(
      ({ source }) => source.kind === "modification" && source.modificationId === id,
    );
    outcomes.push({
      modificationId: id,
      monthlyAmount,
      transfers,
      unplacedTotal: transfers.reduce((total, transfer) => total + unplacedOf(transfer), 0),
      status,
    });
  }
  return outcomes;
}

/** The goal in monthly mode that moves `amount` on each date up to the target date. */
function asMonthlyGoal(goal: SavingsGoal, amount: number, targetDate: string): SavingsGoal {
  const mode: SavingsGoal["parameters"]["mode"] = { kind: "monthly", amount, endDate: targetDate };
  return { ...goal, parameters: { ...goal.parameters, mode } };
}

/**
 * The modifications stage B runs with: each goal in target mode becomes a goal in monthly mode with
 * its resolved amount, or is dropped when it moves nothing. Every savings goal from `beforeIndex`
 * of `applied` on is left out (D8).
 */
function stepModifications(
  applied: readonly Modification[],
  resolutions: ReadonlyMap<number, GoalResolution>,
  beforeIndex = applied.length,
): Modification[] {
  return applied.flatMap((modification, index): Modification[] => {
    if (modification.type !== "savings_goal") return [modification];
    if (index >= beforeIndex) return [];
    const { mode } = modification.parameters;
    if (mode.kind === "monthly") return [modification];
    const amount = resolutions.get(modification.id)?.monthlyAmount ?? 0;
    return amount === 0 ? [] : [asMonthlyGoal(modification, amount, mode.targetDate)];
  });
}

/** The latest target date of the goals in target mode, when it is after `to`; else `to`. */
function latestTargetDate(applied: readonly Modification[], to: string): string {
  return applied.reduce(
    (latest, modification) =>
      modification.type === "savings_goal" &&
      modification.parameters.mode.kind === "target" &&
      modification.parameters.mode.targetDate > latest
        ? modification.parameters.mode.targetDate
        : latest,
    to,
  );
}

/** The end-of-day total of the accounts of `chain` on `day`, an account without balance counting as 0. */
function chainTotal(day: DailyBalance | undefined, chain: readonly number[]): number {
  return chain.reduce((total, accountId) => total + (day?.balances.get(accountId) ?? 0), 0);
}

/**
 * D8: 0 when the target is reached without transfer; unreachable when transfers of the target
 * amount miss it; otherwise the smallest whole amount that reaches it, by bisection on minor
 * units, which rounds up by construction (D4, rule 6). `reaches` runs the engine, never a formula.
 */
function resolveAmount(targetAmount: number, reaches: (amount: number) => boolean): GoalResolution {
  if (reaches(0)) return { monthlyAmount: 0, status: "alreadyReached" };
  if (!reaches(targetAmount)) return UNREACHABLE;
  let low = 1;
  let high = targetAmount;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    if (reaches(middle)) high = middle;
    else low = middle + 1;
  }
  return { monthlyAmount: low, status: "reached" };
}

/**
 * Resolves the goals in target mode by position (D8): goal k sees the goals before it resolved and
 * none after it. A chain that loops is unreachable (owner, 27 Nov 2026, #227).
 */
function resolveTargetGoals(
  applied: readonly Modification[],
  accounts: readonly ProjectionAccount[],
  /** The end-of-day balances of `until`, the last day of the run. */
  project: (modifications: readonly Modification[], until: string) => DailyBalance | undefined,
): Map<number, GoalResolution> {
  const resolutions = new Map<number, GoalResolution>();
  applied.forEach((modification, index) => {
    if (modification.type !== "savings_goal" || modification.parameters.mode.kind !== "target")
      return;
    const { savingsAccountId, mode } = modification.parameters;
    const chain = overflowChainAccounts(savingsAccountId, accounts);
    if (chain === null) {
      resolutions.set(modification.id, UNREACHABLE);
      return;
    }
    const before = stepModifications(applied, resolutions, index);
    const reaches = (amount: number) => {
      const stepped =
        amount === 0 ? before : [...before, asMonthlyGoal(modification, amount, mode.targetDate)];
      return chainTotal(project(stepped, mode.targetDate), chain) >= mode.targetAmount;
    };
    resolutions.set(modification.id, resolveAmount(mode.targetAmount, reaches));
  });
  return resolutions;
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
  const initial: StageAState = {
    items: [...input.items],
    flows: input.estimates.map(estimateFlow),
  };
  const stageA = applyFlowModifications(initial, modifications, context);
  const { items, flows: simulatedFlows, applied: appliedModifications } = stageA;
  // The one balance loop of the engine. Each run gets its own steps: they hold accrued interest.
  const project = (
    runContext: ModificationContext,
    state: StageAState,
    stepped: readonly Modification[],
  ) =>
    projectWithRouting(accounts, realFlows, state.items, today, runContext.range, {
      simulatedFlows: state.flows,
      steps: balanceAwareSteps(stepped, runContext),
    });

  // A target date after the range extends the search to it, never the result (owner, 27 Nov
  // 2026, #227). Past the range, the search sees only the flows the input carries. The loop is
  // causal, so each run of the search stops on the target date.
  const until = (to: string) => ({ ...context, range: { from: range.from, to } });
  const horizonEnd = latestTargetDate(appliedModifications, range.to);
  const horizonState =
    horizonEnd === range.to
      ? stageA
      : applyFlowModifications(initial, appliedModifications, until(horizonEnd));
  const resolutions = resolveTargetGoals(appliedModifications, accounts, (stepped, targetDate) =>
    project(until(targetDate), horizonState, stepped).days.at(-1),
  );
  const problems: ModificationProblem[] = [...stageA.problems];
  for (const [modificationId, { status }] of resolutions)
    if (status === "unreachable") problems.push({ modificationId, reason: "goalUnreachable" });

  const { days, transfers, simulatedTransfers } = project(
    context,
    stageA,
    stepModifications(appliedModifications, resolutions),
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
  const goals = goalOutcomes(appliedModifications, simulatedTransfers, resolutions);
  return { days, transfers, simulatedTransfers, flows, problems, goals };
}

/** The constant-pace simulation: the scenario with no modification. */
export function evaluateConstantPace(input: SimulationInput): SimulationResult {
  const { days, transfers, simulatedTransfers, flows } = evaluateScenario(input, []);
  return { days, transfers, simulatedTransfers, flows };
}
