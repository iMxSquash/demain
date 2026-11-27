// Modifications of a scenario and stage A of its evaluation (DOMAIN, Scenario evaluation pipeline,
// D5 and D6): each modification transforms the future cash flows, in list order. An invalid
// modification is reported with its reason and adds nothing; it never throws. Pure: "today" and
// the data are arguments.

import { parseModificationParameters } from "./modification-parameters";
import type { PlannedItemOccurrences, ProjectionAccount } from "./projection";
import type { DateRange } from "./recurrence";
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

/** Each type issue adds its interface to this union. */
export type Modification = OneOffPurchase;

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
  references(modification: M): References;
  /** The new state, or the reason the modification cannot apply. */
  apply(
    state: StageAState,
    modification: M,
    context: ModificationContext,
  ): StageAState | ModificationProblemReason;
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
  const flow: SimulatedFlow = {
    accountId,
    date,
    amount: -amount,
    categoryId,
    external: true,
    source: { kind: "modification", modificationId: id },
  };
  return { ...state, flows: [...state.flows, flow] };
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
  const itemIds = new Set(context.items.map((item) => item.plannedItemId));
  if (plannedItemIds.some((plannedItemId) => !itemIds.has(plannedItemId)))
    return "plannedItemMissing";
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
    const parsed = parseModificationParameters(modification.type, modification.parameters);
    const outcome =
      transform === undefined || !parsed.ok
        ? "parametersInvalid"
        : (referenceProblem(transform.references(modification), context) ??
          transform.apply(current, modification, context));
    if (typeof outcome === "string")
      problems.push({ modificationId: modification.id, reason: outcome });
    else current = outcome;
  }
  return { ...current, problems };
}
