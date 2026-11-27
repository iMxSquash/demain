// Modifications of a scenario and stage A of its evaluation (DOMAIN, Scenario evaluation pipeline,
// D5 and D6): each modification transforms the future cash flows, in list order. An invalid
// modification is reported with its reason and adds nothing; it never throws. Pure: "today" and
// the data are arguments.

import { parseDate } from "./calendar-date";
import { loanSchedule } from "./loan";
import { parseModificationParameters } from "./modification-parameters";
import { provisionRemaining, type ResolvedOccurrence } from "./occurrence-resolution";
import type { PlannedItemOccurrences, ProjectionAccount } from "./projection";
import { nominalDates, type DateRange, type Repetition } from "./recurrence";
import type { SimulatedFlow } from "./simulation";

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

/** Each type issue adds its interface to this union. */
export type Modification = OneOffPurchase | SubscriptionChange | Loan | IncomeChange;

export type ModificationProblemReason =
  | "accountMissing"
  | "accountArchived"
  | "categoryMissing"
  | "plannedItemMissing"
  | "plannedItemKind"
  | "dateNotAfterToday"
  | "parametersInvalid"
  | "goalUnreachable";

export interface ModificationProblem {
  modificationId: number;
  reason: ModificationProblemReason;
}

export interface ModificationContext {
  accounts: readonly ProjectionAccount[];
  items: readonly PlannedItemOccurrences[];
  itemCategories: ReadonlyMap<number, number | null>;
  categoryIds: ReadonlySet<number>;
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

interface ModificationTransform<M extends Modification> {
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

const SUBSCRIPTION_REPETITIONS: Record<
  Exclude<SubscriptionChange["parameters"]["mode"], "none">,
  (startDate: string) => Repetition
> = {
  monthly: (startDate) => ({ kind: "monthly_on_day", day: parseDate(startDate).day }),
  yearly: () => ({ kind: "yearly" }),
};

/** Where the new flows go: the account and category of the target. */
function subscriptionDestination(
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

// What is already received stays received: a settled occurrence keeps nothing expected, and a
// partial one only what its linked sum leaves of the new amount (owner, 27 Nov 2026, #224).
function withIncomeAmount(occurrence: ResolvedOccurrence, amount: number): ResolvedOccurrence {
  const remaining =
    occurrence.remaining === 0
      ? 0
      : occurrence.status === "partial"
        ? provisionRemaining(amount, occurrence.linkedSum)
        : amount;
  return { ...occurrence, expectedAmount: amount, remaining };
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
    const repetition: Repetition = { kind: "monthly_on_day", day: parseDate(effectiveDate).day };
    const added = nominalDates(repetition, effectiveDate, context.range).map((date) =>
      modificationFlow(id, {
        accountId: target.accountId,
        date,
        amount: change.amount,
        categoryId: target.categoryId,
      }),
    );
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

/** One entry per type of the union: adding a type adds one entry and touches no other branch. */
const TRANSFORMS: { [M in Modification as M["type"]]: ModificationTransform<M> } = {
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
};

function transformOf(type: string): ModificationTransform<Modification> | undefined {
  if (!Object.hasOwn(TRANSFORMS, type)) return undefined;
  // The mapped table pairs each type with the transform of that type.
  return TRANSFORMS[type as Modification["type"]] as ModificationTransform<Modification>;
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

/**
 * Stage A (D5): applies the modifications by position, then id. Each one has its parameters
 * checked against the schema of its type, then its references, then its own transformation.
 */
export function applyFlowModifications(
  state: StageAState,
  modifications: readonly Modification[],
  context: ModificationContext,
): StageAState & { problems: ModificationProblem[] } {
  const problems: ModificationProblem[] = [];
  let current = state;
  for (const modification of [...modifications].sort(byPositionThenId)) {
    const transform = transformOf(modification.type);
    const outcome =
      transform === undefined ||
      !parseModificationParameters(modification.type, modification.parameters).ok
        ? "parametersInvalid"
        : (referenceProblem(transform.references(modification, context), context) ??
          transform.apply(current, modification, context));
    if (typeof outcome === "string")
      problems.push({ modificationId: modification.id, reason: outcome });
    else current = outcome;
  }
  return { ...current, problems };
}
