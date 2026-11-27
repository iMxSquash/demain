// Modifications of a scenario and stage A of its evaluation (DOMAIN, Scenario evaluation pipeline,
// D5 and D6): each modification transforms the future cash flows, in list order. An invalid
// modification is reported with its reason and adds nothing; it never throws. Pure: "today" and
// the data are arguments.

import type { AccountKind } from "./account";
import { daysInMonth, parseDate } from "./calendar-date";
import { loanSchedule } from "./loan";
import { divideRoundBig } from "./money";
import { MAX_LIFE_EVENT_CHILDREN, parseModificationParameters } from "./modification-parameters";
import { provisionRemaining, type ResolvedOccurrence } from "./occurrence-resolution";
import type {
  BalanceAwareSteps,
  PlannedItemOccurrences,
  ProjectionAccount,
  ProjectionFlow,
  SimulatedTransfer,
} from "./projection";
import { nominalDates, type DateRange, type Repetition } from "./recurrence";
import type { SimulatedFlow } from "./simulation";
import {
  estimatedFlows,
  type EstimatedFlow,
  type EstimateLine,
  type EstimateTransaction,
} from "./variable-estimate";

export const MODIFICATION_TYPES = [
  "subscription_change",
  "one_off_purchase",
  "loan",
  "income_change",
  "savings_goal",
  "interest_projection",
  "category_budget_change",
  "life_event",
] as const;

export type ModificationType = (typeof MODIFICATION_TYPES)[number];

interface ModificationBase {
  id: number;
  position: number;
  label: string;
}

export interface OneOffPurchase extends ModificationBase {
  type: "one_off_purchase";
  parameters: { accountId: number; date: string; amount: number; categoryId: number | null };
}

export interface SubscriptionChange extends ModificationBase {
  type: "subscription_change";
  parameters: {
    target:
      | { kind: "existing"; plannedItemId: number }
      | { kind: "new"; accountId: number; categoryId: number | null };
    mode: "monthly" | "yearly" | "none";
    /** Positive minor units; absent when mode is "none". */
    amount?: number;
    startDate: string;
  };
}

export interface Loan extends ModificationBase {
  type: "loan";
  parameters: {
    /** Positive minor units. */
    principal: number;
    months: number;
    annualRateBp: number;
    receivedOn: string;
    paymentAccountId: number;
    /** Null for instalments: nothing is received. */
    principalAccountId: number | null;
    categoryId: number | null;
  };
}

export interface IncomeChange extends ModificationBase {
  type: "income_change";
  parameters: {
    target: SubscriptionChange["parameters"]["target"];
    /** The amount is positive minor units. */
    change: { kind: "amount"; amount: number } | { kind: "end" };
    effectiveDate: string;
  };
}

export interface SavingsGoal extends ModificationBase {
  type: "savings_goal";
  parameters: {
    sourceAccountId: number;
    savingsAccountId: number;
    firstTransferDate: string;
    /** Amounts are positive minor units; a null end date runs to the end of the range. */
    mode:
      | { kind: "monthly"; amount: number; endDate: string | null }
      | { kind: "target"; targetAmount: number; targetDate: string };
  };
}

export interface InterestProjection extends ModificationBase {
  type: "interest_projection";
  parameters: {
    accountId: number;
    annualRateBp: number;
    /** Credited on the last day of each month, or on 31 December. */
    frequency: "monthly" | "yearly";
    startDate: string;
  };
}

export interface CategoryBudgetChange extends ModificationBase {
  type: "category_budget_change";
  parameters: {
    accountId: number;
    /** Null for the uncategorized line of the account. */
    categoryId: number | null;
    /** YYYY-MM. */
    startMonth: string;
    /** Basis points from -10000 to 100000, or a monthly amount of zero or more in minor units. */
    change: { kind: "percent"; basisPoints: number } | { kind: "amount"; monthlyAmount: number };
  };
}

/** Groups 1 to 20 modifications of types 1 to 7, applied at its place in their own order (D5). */
export interface LifeEvent extends ModificationBase {
  type: "life_event";
  parameters: Record<string, never>;
  children: readonly ChildModification[];
}

/** Each type issue adds its interface to this union. */
export type Modification =
  | OneOffPurchase
  | SubscriptionChange
  | Loan
  | IncomeChange
  | SavingsGoal
  | InterestProjection
  | CategoryBudgetChange
  | LifeEvent;

/** A life event never contains another one. */
export type ChildModification = Exclude<Modification, LifeEvent>;

export type ModificationProblemReason =
  | "accountMissing"
  | "accountArchived"
  | "categoryMissing"
  | "plannedItemMissing"
  | "plannedItemKind"
  | "accountKind"
  | "dateNotAfterToday"
  | "parametersInvalid"
  | "goalUnreachable"
  /** A raise on an existing item that ends before the effective date (owner, 27 Nov 2026, #231). */
  | "plannedItemEnded";

export interface ModificationProblem {
  modificationId: number;
  reason: ModificationProblemReason;
}

export interface ModificationContext {
  accounts: readonly ProjectionAccount[];
  items: readonly PlannedItemOccurrences[];
  itemCategories: ReadonlyMap<number, number | null>;
  categoryIds: ReadonlySet<number>;
  /** An account missing from it has no known kind: a savings goal into it is refused. */
  accountKinds: ReadonlyMap<number, AccountKind>;
  /** The inputs of the estimated flows, so that a category budget change can spread a new amount. */
  estimates: { lines: readonly EstimateLine[]; transactions: readonly EstimateTransaction[] };
  today: string;
  range: DateRange;
}

/** What stage A transforms: the occurrences of planned items, and the other flows (estimates and added flows). */
export interface StageAState {
  items: PlannedItemOccurrences[];
  flows: SimulatedFlow[];
}

/** The accounts, categories and planned items a modification refers to, checked before it applies (D6). */
interface References {
  accountIds: readonly number[];
  categoryIds: readonly number[];
  plannedItemIds: readonly number[];
}

interface ModificationTransform<M extends ChildModification> {
  /** The context lets a modification on an existing item refer to the account of that item. */
  references(modification: M, context: ModificationContext): References;
  /** The new state, or the reason the modification cannot apply. */
  apply(
    state: StageAState,
    modification: M,
    context: ModificationContext,
  ): StageAState | ModificationProblemReason;
}

/** A flow to or from outside the user's accounts, added by modification `modificationId`. */
function modificationFlow(
  modificationId: number,
  flow: Omit<SimulatedFlow, "external" | "source">,
): SimulatedFlow {
  return { ...flow, external: true, source: { kind: "modification", modificationId } };
}

function oneOffPurchase(
  state: StageAState,
  { id, parameters }: OneOffPurchase,
  { today, range }: ModificationContext,
): StageAState | ModificationProblemReason {
  const { accountId, date, amount, categoryId } = parameters;
  // Checked before the range, so that a past purchase is reported rather than silently dropped.
  if (date <= today) return "dateNotAfterToday";
  if (date < range.from || date > range.to) return state;
  const flow = modificationFlow(id, { accountId, date, amount: -amount, categoryId });
  return { ...state, flows: [...state.flows, flow] };
}

function plannedItemOf(
  plannedItemId: number,
  { items }: ModificationContext,
): PlannedItemOccurrences | undefined {
  return items.find((item) => item.plannedItemId === plannedItemId);
}

function targetReferences(
  { parameters: { target } }: SubscriptionChange | IncomeChange,
  context: ModificationContext,
): References {
  if (target.kind === "new") {
    return {
      accountIds: [target.accountId],
      categoryIds: target.categoryId === null ? [] : [target.categoryId],
      plannedItemIds: [],
    };
  }
  const item = plannedItemOf(target.plannedItemId, context);
  return {
    accountIds: item === undefined ? [] : [item.accountId],
    categoryIds: [],
    plannedItemIds: [target.plannedItemId],
  };
}

export function monthlyOnDay(date: string): Repetition {
  return { kind: "monthly_on_day", day: parseDate(date).day };
}

export const SUBSCRIPTION_REPETITIONS: Record<
  Exclude<SubscriptionChange["parameters"]["mode"], "none">,
  (startDate: string) => Repetition
> = {
  monthly: monthlyOnDay,
  yearly: () => ({ kind: "yearly" }),
};

/** Where the new flows go: the account and category of the target. */
export function subscriptionDestination(
  target: SubscriptionChange["parameters"]["target"],
  context: ModificationContext,
): { accountId: number; categoryId: number | null } | ModificationProblemReason {
  if (target.kind === "new") return target;
  // Present: its reference was checked before.
  const item = plannedItemOf(target.plannedItemId, context);
  if (item?.kind !== "expense") return "plannedItemKind";
  return {
    accountId: item.accountId,
    categoryId: context.itemCategories.get(item.plannedItemId) ?? null,
  };
}

// Only the occurrences of the planned item go: the flows already added, by an earlier change on the
// same target too, are left alone (D2).
function subscriptionChange(
  state: StageAState,
  { id, parameters }: SubscriptionChange,
  context: ModificationContext,
): StageAState | ModificationProblemReason {
  const { target, mode, amount, startDate } = parameters;
  const destination = subscriptionDestination(target, context);
  if (typeof destination === "string") return destination;
  if (startDate <= context.today) return "dateNotAfterToday";

  const items =
    target.kind === "new"
      ? state.items
      : state.items.map((item) =>
          item.plannedItemId === target.plannedItemId
            ? {
                ...item,
                occurrences: item.occurrences.filter(
                  (occurrence) => occurrence.nominalDate < startDate,
                ),
              }
            : item,
        );
  if (mode === "none" || amount === undefined) return { ...state, items };

  const added = nominalDates(
    SUBSCRIPTION_REPETITIONS[mode](startDate),
    startDate,
    context.range,
  ).map((date) =>
    modificationFlow(id, {
      accountId: destination.accountId,
      date,
      amount: -amount,
      categoryId: destination.categoryId,
    }),
  );
  return { items, flows: [...state.flows, ...added] };
}

// What is already received stays received (owner, 27 Nov 2026, #224): a partial occurrence keeps
// what its linked sum leaves of the new amount, and a closed one with nothing left (settled, or a
// provision whose period has passed) keeps 0. The status comes first: an open occurrence can have
// 0 remaining after an earlier change or a zero estimate.
function incomeRemaining(occurrence: ResolvedOccurrence, amount: number): number {
  if (occurrence.status === "planned") return amount;
  if (occurrence.status === "partial") return provisionRemaining(amount, occurrence.linkedSum);
  return occurrence.remaining === 0 ? 0 : amount;
}

function withIncomeAmount(occurrence: ResolvedOccurrence, amount: number): ResolvedOccurrence {
  const remaining = incomeRemaining(occurrence, amount);
  return { ...occurrence, expectedAmount: amount, remaining };
}

function newIncomeFlows(
  modificationId: number,
  { accountId, categoryId }: { accountId: number; categoryId: number | null },
  amount: number,
  effectiveDate: string,
  range: DateRange,
): SimulatedFlow[] {
  return nominalDates(monthlyOnDay(effectiveDate), effectiveDate, range).map((date) =>
    modificationFlow(modificationId, { accountId, date, amount, categoryId }),
  );
}

// Only the occurrences of the planned item change: the flows already added are left alone (D2).
function incomeChange(
  state: StageAState,
  { id, parameters }: IncomeChange,
  context: ModificationContext,
): StageAState | ModificationProblemReason {
  const { target, change, effectiveDate } = parameters;
  if (target.kind === "existing" && plannedItemOf(target.plannedItemId, context)?.kind !== "income")
    return "plannedItemKind";
  if (effectiveDate <= context.today) return "dateNotAfterToday";

  if (target.kind === "new") {
    // The schema refuses an end on a new income.
    if (change.kind === "end") return "parametersInvalid";
    const added = newIncomeFlows(id, target, change.amount, effectiveDate, context.range);
    return { ...state, flows: [...state.flows, ...added] };
  }

  const changed = (occurrences: readonly ResolvedOccurrence[]) =>
    change.kind === "end"
      ? occurrences.filter((occurrence) => occurrence.nominalDate < effectiveDate)
      : occurrences.map((occurrence) =>
          occurrence.nominalDate < effectiveDate
            ? occurrence
            : withIncomeAmount(occurrence, change.amount),
        );
  const items = state.items.map((item) =>
    item.plannedItemId === target.plannedItemId
      ? { ...item, occurrences: changed(item.occurrences) }
      : item,
  );
  return { ...state, items };
}

// The whole schedule is computed, so that the payments inside the range keep their amounts, but
// only the flows dated inside the range are added. The principal received carries no category: it
// is not an income, and the total cost leaves it out (D10).
function loan(
  state: StageAState,
  { id, parameters }: Loan,
  { today, range }: ModificationContext,
): StageAState | ModificationProblemReason {
  const {
    principal,
    months,
    annualRateBp,
    receivedOn,
    paymentAccountId,
    principalAccountId,
    categoryId,
  } = parameters;
  if (receivedOn <= today) return "dateNotAfterToday";
  const received =
    principalAccountId === null
      ? []
      : [
          modificationFlow(id, {
            accountId: principalAccountId,
            date: receivedOn,
            amount: principal,
            categoryId: null,
          }),
        ];
  // A payment of zero, a small principal over many months, moves nothing.
  const payments = loanSchedule(principal, months, annualRateBp, receivedOn)
    .filter(({ amount }) => amount > 0)
    .map(({ date, amount }) =>
      modificationFlow(id, { accountId: paymentAccountId, date, amount: -amount, categoryId }),
    );
  const added = [...received, ...payments].filter(
    (flow) => flow.date >= range.from && flow.date <= range.to,
  );
  return { ...state, flows: [...state.flows, ...added] };
}

export function estimateFlow({
  accountId,
  categoryId,
  date,
  amount,
}: EstimatedFlow): SimulatedFlow {
  return {
    accountId,
    date,
    amount,
    source: { kind: "estimate", categoryId },
    categoryId,
    external: true,
  };
}

export const BASIS_POINTS = 10000;

// A percentage scales each flow on its own (D4 rule 5), so in the current month it scales what
// remains. A new amount is spread again by `estimatedFlows`, which keeps the current-month rule
// (D4 rule 2). Only estimated flows change, never a planned item.
function categoryBudgetChange(
  state: StageAState,
  { parameters }: CategoryBudgetChange,
  { estimates, today, range }: ModificationContext,
): StageAState | ModificationProblemReason {
  const { accountId, categoryId, startMonth, change } = parameters;
  // Checked first: an earlier month would give `estimatedFlows` a date it refuses.
  if (startMonth < today.slice(0, 7)) return "dateNotAfterToday";
  const monthStart = `${startMonth}-01`;
  const isChanged = (flow: SimulatedFlow) =>
    flow.source.kind === "estimate" &&
    flow.accountId === accountId &&
    flow.categoryId === categoryId &&
    flow.date >= monthStart;

  if (change.kind === "percent") {
    const factor = BigInt(BASIS_POINTS + change.basisPoints);
    const flows: SimulatedFlow[] = [];
    for (const flow of state.flows) {
      if (!isChanged(flow)) {
        flows.push(flow);
        continue;
      }
      // Stacked changes can scale a flow past the safe integer range: reported, never thrown.
      const amount = Number(divideRoundBig(BigInt(flow.amount) * factor, BigInt(BASIS_POINTS)));
      if (!Number.isSafeInteger(amount)) return "parametersInvalid";
      if (amount !== 0) flows.push({ ...flow, amount });
    }
    return { ...state, flows };
  }

  const line = estimates.lines.find(
    (candidate) => candidate.accountId === accountId && candidate.categoryId === categoryId,
  ) ?? {
    accountId,
    categoryId,
    monthlySpending: 0,
    monthsUsed: 0,
    averageSpending: 0,
    overridden: false,
  };
  // The range start too, so that no flow lands before the range.
  const from = [monthStart, today, range.from].reduce((latest, date) =>
    date > latest ? date : latest,
  );
  const added = estimatedFlows(
    [{ ...line, monthlySpending: change.monthlyAmount }],
    estimates.transactions,
    { from, to: range.to },
    today,
  ).map(estimateFlow);
  return { ...state, flows: [...state.flows.filter((flow) => !isChanged(flow)), ...added] };
}

// A savings goal adds nothing in stage A: its transfers depend on the running balances, so they are
// generated in stage B by `balanceAwareSteps`. Checking it here reports its problems with the others.
function savingsGoalProblem(
  { parameters }: SavingsGoal,
  { accountKinds, today }: ModificationContext,
): ModificationProblemReason | null {
  if (accountKinds.get(parameters.savingsAccountId) !== "savings") return "accountKind";
  if (parameters.firstTransferDate <= today) return "dateNotAfterToday";
  return null;
}

// Interest adds nothing in stage A either: it is computed on the projected balances in stage B.
function interestProjectionProblem(
  { parameters }: InterestProjection,
  { accountKinds, today }: ModificationContext,
): ModificationProblemReason | null {
  if (accountKinds.get(parameters.accountId) !== "savings") return "accountKind";
  if (parameters.startDate <= today) return "dateNotAfterToday";
  return null;
}

/**
 * One entry per type of the union: adding a type adds one entry and touches no other branch. A
 * life event has none: it is expanded before, so a stored child of that type is refused.
 */
const TRANSFORMS: { [M in ChildModification as M["type"]]: ModificationTransform<M> } = {
  one_off_purchase: {
    references: ({ parameters: { accountId, categoryId } }) => ({
      accountIds: [accountId],
      categoryIds: categoryId === null ? [] : [categoryId],
      plannedItemIds: [],
    }),
    apply: oneOffPurchase,
  },
  subscription_change: { references: targetReferences, apply: subscriptionChange },
  loan: {
    references: ({ parameters: { paymentAccountId, principalAccountId, categoryId } }) => ({
      accountIds:
        principalAccountId === null ? [paymentAccountId] : [paymentAccountId, principalAccountId],
      categoryIds: categoryId === null ? [] : [categoryId],
      plannedItemIds: [],
    }),
    apply: loan,
  },
  income_change: { references: targetReferences, apply: incomeChange },
  savings_goal: {
    references: ({ parameters: { sourceAccountId, savingsAccountId } }) => ({
      accountIds: [sourceAccountId, savingsAccountId],
      categoryIds: [],
      plannedItemIds: [],
    }),
    apply: (state, goal, context) => savingsGoalProblem(goal, context) ?? state,
  },
  interest_projection: {
    references: ({ parameters: { accountId } }) => ({
      accountIds: [accountId],
      categoryIds: [],
      plannedItemIds: [],
    }),
    apply: (state, projection, context) => interestProjectionProblem(projection, context) ?? state,
  },
  category_budget_change: {
    references: ({ parameters: { accountId, categoryId } }) => ({
      accountIds: [accountId],
      categoryIds: categoryId === null ? [] : [categoryId],
      plannedItemIds: [],
    }),
    apply: categoryBudgetChange,
  },
};

function transformOf(type: string): ModificationTransform<ChildModification> | undefined {
  if (!Object.hasOwn(TRANSFORMS, type)) return undefined;
  // The mapped table pairs each type with the transform of that type.
  return TRANSFORMS[type as ChildModification["type"]] as ModificationTransform<ChildModification>;
}

function referenceProblem(
  { accountIds, categoryIds, plannedItemIds }: References,
  context: ModificationContext,
): ModificationProblemReason | null {
  for (const accountId of accountIds) {
    const account = context.accounts.find((candidate) => candidate.id === accountId);
    if (account === undefined) return "accountMissing";
    if (account.archived) return "accountArchived";
  }
  if (categoryIds.some((categoryId) => !context.categoryIds.has(categoryId)))
    return "categoryMissing";
  const isPlannedItem = (plannedItemId: number) =>
    context.items.some((item) => item.plannedItemId === plannedItemId);
  if (!plannedItemIds.every(isPlannedItem)) return "plannedItemMissing";
  return null;
}

function byPositionThenId(a: Modification, b: Modification): number {
  return a.position - b.position || a.id - b.id;
}

// Stored rows are not trusted: the children may be missing or too many.
function isValidLifeEvent({ parameters, children }: LifeEvent): boolean {
  return (
    parseModificationParameters("life_event", parameters).ok &&
    Array.isArray(children) &&
    children.length >= 1 &&
    children.length <= MAX_LIFE_EVENT_CHILDREN
  );
}

/**
 * The modifications in the order they apply (D5): by position, then id, each life event replaced
 * by its children by their own position, then id. An invalid life event is reported in `problems`
 * and none of its children applies. A generator, so that its problem comes at its place among the
 * problems of the modifications the caller applies.
 */
function* inApplicationOrder(
  modifications: readonly Modification[],
  problems: ModificationProblem[],
): Generator<ChildModification> {
  for (const modification of [...modifications].sort(byPositionThenId)) {
    if (modification.type !== "life_event") yield modification;
    else if (isValidLifeEvent(modification))
      yield* [...modification.children].sort(byPositionThenId);
    else problems.push({ modificationId: modification.id, reason: "parametersInvalid" });
  }
}

/** The transform of a modification whose parameters and references pass, or the reason they do not. */
function checkedTransform(
  modification: ChildModification,
  context: ModificationContext,
): ModificationTransform<ChildModification> | ModificationProblemReason {
  const transform = transformOf(modification.type);
  if (
    transform === undefined ||
    !parseModificationParameters(modification.type, modification.parameters).ok
  )
    return "parametersInvalid";
  return referenceProblem(transform.references(modification, context), context) ?? transform;
}

/**
 * Stage A (D5): applies the modifications by position, then id, a life event expanded in place.
 * Each one has its parameters checked against the schema of its type, then its references, then
 * its own transformation. `applied` lists the valid modifications in that order, savings goals
 * included, the children of a life event in place of it.
 */
export function applyFlowModifications(
  state: StageAState,
  modifications: readonly Modification[],
  context: ModificationContext,
): StageAState & { problems: ModificationProblem[]; applied: ChildModification[] } {
  const problems: ModificationProblem[] = [];
  const applied: ChildModification[] = [];
  let current = state;
  for (const modification of inApplicationOrder(modifications, problems)) {
    const transform = checkedTransform(modification, context);
    const outcome =
      typeof transform === "string" ? transform : transform.apply(current, modification, context);
    if (typeof outcome === "string") {
      problems.push({ modificationId: modification.id, reason: outcome });
    } else {
      current = outcome;
      applied.push(modification);
    }
  }
  return { ...current, problems, applied };
}

const INTEREST_DENOMINATOR = 10000n * 365n;

const IS_CREDIT_DAY: Record<
  InterestProjection["parameters"]["frequency"],
  (date: string) => boolean
> = {
  monthly: (date) => {
    const { year, month, day } = parseDate(date);
    return day === daysInMonth(year, month);
  },
  yearly: (date) => date.endsWith("-12-31"),
};

const STARTS_PERIOD: Record<
  InterestProjection["parameters"]["frequency"],
  (date: string) => boolean
> = {
  monthly: (date) => date.endsWith("-01"),
  yearly: (date) => date.endsWith("-01-01"),
};

/** An interest projection being accrued: the sum of the end-of-day balances of its open period. */
interface InterestAccrual {
  projection: InterestProjection;
  sum: bigint;
  /** False while the open period started before the range, so that some of its days are missing. */
  complete: boolean;
}

// D9: a negative day counts as zero, the denominator is 365 even in a leap year, and the period
// ends on its credit day. A period the range cuts, at its end or its start, is not credited.
function interestCredit(
  accrual: InterestAccrual,
  date: string,
  balances: ReadonlyMap<number, number>,
): ProjectionFlow | null {
  const { id, parameters } = accrual.projection;
  if (date < parameters.startDate) return null;
  accrual.sum += BigInt(Math.max(0, balances.get(parameters.accountId) ?? 0));
  if (!IS_CREDIT_DAY[parameters.frequency](date)) return null;
  const amount = divideRoundBig(
    accrual.sum * BigInt(parameters.annualRateBp),
    INTEREST_DENOMINATOR,
  );
  const { complete } = accrual;
  accrual.sum = 0n;
  accrual.complete = true;
  if (!complete) return null;
  return {
    accountId: parameters.accountId,
    date,
    amount: Number(amount),
    source: { kind: "modification", modificationId: id },
  };
}

/**
 * Stage B (D5): the monthly transfers of the savings goals, routed by the projection loop along
 * the overflow chain of the savings account. They repeat on the day of the first transfer, up to
 * the end date or the end of the range; the projection asks only for the days of the range. A goal
 * in target mode is skipped: `evaluateScenario` hands it over in monthly mode once resolved (D8).
 * Then the interest projections, credited last on their day and never routed (D9).
 *
 * The modifications come in the order they apply, as `applied` of stage A lists them: sorting
 * them again by position would mix the children of a life event with the other modifications.
 * The result holds the interest accrued so far: it serves one projection, which asks for each day
 * of the range once, in order.
 */
export function balanceAwareSteps(
  modifications: readonly Modification[],
  context: ModificationContext,
): BalanceAwareSteps {
  const transfersByDate = new Map<string, SimulatedTransfer[]>();
  const accruals: InterestAccrual[] = [];
  for (const modification of modifications) {
    if (
      modification.type === "interest_projection" &&
      typeof checkedTransform(modification, context) !== "string" &&
      interestProjectionProblem(modification, context) === null
    )
      accruals.push({
        projection: modification,
        sum: 0n,
        complete:
          modification.parameters.startDate >= context.range.from ||
          STARTS_PERIOD[modification.parameters.frequency](context.range.from),
      });
    if (
      modification.type !== "savings_goal" ||
      typeof checkedTransform(modification, context) === "string" ||
      savingsGoalProblem(modification, context) !== null
    )
      continue;
    const { id, parameters } = modification;
    const { sourceAccountId, savingsAccountId, firstTransferDate, mode } = parameters;
    if (mode.kind !== "monthly") continue;
    // An end date before the range leaves `to` before `from`: no date then.
    const to =
      mode.endDate !== null && mode.endDate < context.range.to ? mode.endDate : context.range.to;
    const range = { from: context.range.from, to };
    for (const date of nominalDates(monthlyOnDay(firstTransferDate), firstTransferDate, range)) {
      const transfers = transfersByDate.get(date) ?? [];
      transfers.push({
        sourceAccountId,
        destinationAccountId: savingsAccountId,
        amount: mode.amount,
        date,
        source: { kind: "modification", modificationId: id },
      });
      transfersByDate.set(date, transfers);
    }
  }
  return {
    transfersOn: (date) => transfersByDate.get(date) ?? [],
    creditsOn: (date, balances) =>
      accruals.flatMap((accrual) => interestCredit(accrual, date, balances) ?? []),
  };
}
