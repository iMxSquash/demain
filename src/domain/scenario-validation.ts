// The plan of the validation of a scenario (DOMAIN, Comparison and diagrams, Validation, D13): the
// planned item changes and the notes its modifications become, and the problems that refuse it as
// a whole. It writes nothing: the ledger applies the plan. Pure: "today" and the data are arguments.

import { addDays } from "./calendar-date";
import { loanSchedule } from "./loan";
import {
  applyFlowModifications,
  monthlyOnDay,
  SUBSCRIPTION_REPETITIONS,
  subscriptionDestination,
  type CategoryBudgetChange,
  type ChildModification,
  type IncomeChange,
  type Loan,
  type Modification,
  type ModificationContext,
  type ModificationProblem,
  type ModificationProblemReason,
  type SavingsGoal,
  type SubscriptionChange,
} from "./modification";
import { divideRound } from "./money";
import type { PlannedSchedule } from "./occurrences";
import {
  versionInEffectAt,
  type PlannedItemInput,
  type PlannedItemVersionInput,
} from "./planned-item";
import { nominalDates } from "./recurrence";
import type { GoalOutcome } from "./simulation";

export type PlannedItemChange =
  | {
      kind: "create";
      modificationId: number;
      input: PlannedItemInput;
      /** The override of the last occurrence, signed, when it differs from the regular amount. */
      lastOccurrenceAmount: { nominalDate: string; amount: number } | null;
    }
  | { kind: "end"; modificationId: number; plannedItemId: number; endDate: string }
  | {
      kind: "version";
      modificationId: number;
      plannedItemId: number;
      input: PlannedItemVersionInput;
    };

export type ValidationNote =
  | { kind: "interestNotConverted"; modificationId: number }
  | {
      kind: "estimateOverride";
      modificationId: number;
      accountId: number;
      categoryId: number | null;
      monthlyAmount: number;
      /**
       * YYYY-MM, shown only: the shared override has no date, so it applies from the validation
       * on (owner, 27 Nov 2026, #231).
       */
      startMonth: string;
    };

export interface ValidationPlan {
  changes: PlannedItemChange[];
  notes: ValidationNote[];
  /** Not empty: the plan is not to be applied, the ledger refuses it as a whole. */
  problems: ModificationProblem[];
}

export interface ValidationContext extends ModificationContext {
  schedules: ReadonlyMap<number, PlannedSchedule>;
  /** Monthly amount of each savings goal, from the GoalOutcomes of the evaluation. */
  goalAmounts: ReadonlyMap<number, { monthlyAmount: number; status: GoalOutcome["status"] }>;
}

interface Planned {
  changes: PlannedItemChange[];
  notes: ValidationNote[];
}

type Planner<M extends ChildModification> = (
  modification: M,
  context: ValidationContext,
) => Planned | ModificationProblemReason;

const NOTHING: Planned = { changes: [], notes: [] };
const BASIS_POINTS = 10000;

function created(
  modificationId: number,
  input: Omit<PlannedItemInput, "businessDayRule" | "amountMode">,
  lastOccurrenceAmount: { nominalDate: string; amount: number } | null = null,
): PlannedItemChange {
  return {
    kind: "create",
    modificationId,
    input: { ...input, businessDayRule: "none", amountMode: "fixed" },
    lastOccurrenceAmount,
  };
}

/** The schedule of a target item, or why there is none: its reference was checked in stage A. */
function scheduleOf(
  plannedItemId: number,
  { schedules }: ValidationContext,
): PlannedSchedule | ModificationProblemReason {
  return schedules.get(plannedItemId) ?? "plannedItemMissing";
}

function endsBefore({ endDate }: PlannedSchedule, date: string): boolean {
  return endDate !== null && endDate < date;
}

/** The end the day before `date`, unless the item already ends before it (owner, 27 Nov 2026, #231). */
function endBefore(
  modificationId: number,
  plannedItemId: number,
  schedule: PlannedSchedule,
  date: string,
): PlannedItemChange[] {
  if (endsBefore(schedule, date)) return [];
  return [{ kind: "end", modificationId, plannedItemId, endDate: addDays(date, -1) }];
}

function planSubscriptionChange(
  { id, label, parameters }: SubscriptionChange,
  context: ValidationContext,
): Planned | ModificationProblemReason {
  const { target, mode, amount, startDate } = parameters;
  const destination = subscriptionDestination(target, context);
  if (typeof destination === "string") return destination;
  const changes: PlannedItemChange[] = [];
  if (target.kind === "existing") {
    const schedule = scheduleOf(target.plannedItemId, context);
    if (typeof schedule === "string") return schedule;
    changes.push(...endBefore(id, target.plannedItemId, schedule, startDate));
  }
  if (mode !== "none" && amount !== undefined) {
    changes.push(
      created(id, {
        name: label,
        kind: "expense",
        ...destination,
        startDate,
        endDate: null,
        repetition: SUBSCRIPTION_REPETITIONS[mode](startDate),
        amount: -amount,
      }),
    );
  }
  return { changes, notes: [] };
}

// The payments repeat on the day of the date received, which a shorter month clamps: the first
// payment of a loan received on the 31st can fall on the 28th.
function planLoan({ id, label, parameters }: Loan): Planned {
  const {
    principal,
    months,
    annualRateBp,
    receivedOn,
    paymentAccountId,
    principalAccountId,
    categoryId,
  } = parameters;
  // A payment of zero moves nothing, as in stage A.
  const payments = loanSchedule(principal, months, annualRateBp, receivedOn).filter(
    ({ amount }) => amount > 0,
  );
  const first = payments[0];
  const last = payments.at(-1);
  const changes: PlannedItemChange[] = [];
  if (first !== undefined && last !== undefined) {
    changes.push(
      created(
        id,
        {
          name: label,
          kind: "expense",
          accountId: paymentAccountId,
          categoryId,
          startDate: first.date,
          endDate: last.date,
          repetition: monthlyOnDay(receivedOn),
          amount: -first.amount,
        },
        last.amount === first.amount ? null : { nominalDate: last.date, amount: -last.amount },
      ),
    );
  }
  if (principalAccountId !== null) {
    // The principal received is not an income of a category (D10).
    changes.push(
      created(id, {
        name: label,
        kind: "income",
        accountId: principalAccountId,
        categoryId: null,
        startDate: receivedOn,
        endDate: null,
        repetition: null,
        amount: principal,
      }),
    );
  }
  return { changes, notes: [] };
}

function planIncomeChange(
  { id, label, parameters }: IncomeChange,
  context: ValidationContext,
): Planned | ModificationProblemReason {
  const { target, change, effectiveDate } = parameters;
  if (target.kind === "new") {
    // Stage A refuses an end on a new income.
    if (change.kind === "end") return "parametersInvalid";
    const { accountId, categoryId } = target;
    const input = {
      name: label,
      kind: "income",
      accountId,
      categoryId,
      startDate: effectiveDate,
      endDate: null,
      repetition: monthlyOnDay(effectiveDate),
      amount: change.amount,
    } as const;
    return { changes: [created(id, input)], notes: [] };
  }
  const { plannedItemId } = target;
  const schedule = scheduleOf(plannedItemId, context);
  if (typeof schedule === "string") return schedule;
  if (change.kind === "end")
    return { changes: endBefore(id, plannedItemId, schedule, effectiveDate), notes: [] };
  // A raise on an item already over would revive it (owner, 27 Nov 2026, #231).
  if (endsBefore(schedule, effectiveDate)) return "plannedItemEnded";
  const inEffect = versionInEffectAt(schedule.versions, effectiveDate);
  const input: PlannedItemVersionInput = {
    effectiveFrom: effectiveDate,
    repetition: inEffect.repetition,
    businessDayRule: inEffect.businessDayRule,
    amount: change.amount,
    amountMode: "fixed",
  };
  return { changes: [{ kind: "version", modificationId: id, plannedItemId, input }], notes: [] };
}

/** The monthly amount of a goal, null when it moves nothing, or the reason it cannot apply (D8). */
function goalMonthlyAmount(
  { id, parameters: { mode } }: SavingsGoal,
  { goalAmounts }: ValidationContext,
): number | null | ModificationProblemReason {
  if (mode.kind === "monthly") return mode.amount;
  const outcome = goalAmounts.get(id);
  // A goal the evaluation did not resolve is unreachable, as in `evaluateScenario`.
  if (outcome === undefined || outcome.status === "unreachable") return "goalUnreachable";
  return outcome.status === "alreadyReached" ? null : outcome.monthlyAmount;
}

// In target mode, the transfers run up to the last monthly date on or before the target date: the
// same dates the simulation gives the goal.
function planSavingsGoal(
  goal: SavingsGoal,
  context: ValidationContext,
): Planned | ModificationProblemReason {
  const amount = goalMonthlyAmount(goal, context);
  if (typeof amount === "string") return amount;
  if (amount === null) return NOTHING;
  const { sourceAccountId, savingsAccountId, firstTransferDate, mode } = goal.parameters;
  const repetition = monthlyOnDay(firstTransferDate);
  const endDate =
    mode.kind === "monthly"
      ? mode.endDate
      : (nominalDates(repetition, firstTransferDate, {
          from: firstTransferDate,
          to: mode.targetDate,
        }).at(-1) ?? null);
  const input = {
    name: goal.label,
    kind: "transfer",
    accountId: sourceAccountId,
    destinationAccountId: savingsAccountId,
    categoryId: null,
    startDate: firstTransferDate,
    endDate,
    repetition,
    amount: -amount,
  } as const;
  return { changes: [created(goal.id, input)], notes: [] };
}

// A percentage scales the current monthly estimate of the line with one rounding (D4 rule 5). A
// line without estimate starts from 0, as in stage A.
function planCategoryBudgetChange(
  { id, parameters }: CategoryBudgetChange,
  { estimates }: ValidationContext,
): Planned | ModificationProblemReason {
  const { accountId, categoryId, startMonth, change } = parameters;
  let monthlyAmount: number;
  if (change.kind === "amount") {
    monthlyAmount = change.monthlyAmount;
  } else {
    const line = estimates.lines.find(
      (candidate) => candidate.accountId === accountId && candidate.categoryId === categoryId,
    );
    const product = (line?.monthlySpending ?? 0) * (BASIS_POINTS + change.basisPoints);
    // Reported, never thrown, like the stacked percentages of stage A.
    if (!Number.isSafeInteger(product)) return "parametersInvalid";
    monthlyAmount = divideRound(product, BASIS_POINTS);
  }
  const note: ValidationNote = {
    kind: "estimateOverride",
    modificationId: id,
    accountId,
    categoryId,
    monthlyAmount,
    startMonth,
  };
  return { changes: [], notes: [note] };
}

/** One entry per type of the union, as in stage A. A life event is expanded before. */
const PLANNERS: { [M in ChildModification as M["type"]]: Planner<M> } = {
  subscription_change: planSubscriptionChange,
  one_off_purchase: ({ id, label, parameters }) => ({
    changes: [
      created(id, {
        name: label,
        kind: "expense",
        accountId: parameters.accountId,
        categoryId: parameters.categoryId,
        startDate: parameters.date,
        endDate: null,
        repetition: null,
        amount: -parameters.amount,
      }),
    ],
    notes: [],
  }),
  loan: planLoan,
  income_change: planIncomeChange,
  savings_goal: planSavingsGoal,
  interest_projection: ({ id }) => ({
    changes: [],
    notes: [{ kind: "interestNotConverted", modificationId: id }],
  }),
  category_budget_change: planCategoryBudgetChange,
};

function planOne(modification: ChildModification, context: ValidationContext) {
  // The mapped table pairs each type with the planner of that type.
  const planner = PLANNERS[modification.type] as Planner<ChildModification>;
  return planner(modification, context);
}

/**
 * The changes and notes of each valid modification, in the order they apply (D5): by position,
 * then id, a life event replaced by its children. The invalid modifications are those stage A
 * reports (D6), then those that cannot be planned, an unreachable goal among them (D8).
 */
export function planScenarioValidation(
  modifications: readonly Modification[],
  context: ValidationContext,
): ValidationPlan {
  const stageA = applyFlowModifications(
    { items: [...context.items], flows: [] },
    modifications,
    context,
  );
  const plan: ValidationPlan = { changes: [], notes: [], problems: [...stageA.problems] };
  for (const modification of stageA.applied) {
    const planned = planOne(modification, context);
    if (typeof planned === "string") {
      plan.problems.push({ modificationId: modification.id, reason: planned });
      continue;
    }
    plan.changes.push(...planned.changes);
    plan.notes.push(...planned.notes);
  }
  return plan;
}
