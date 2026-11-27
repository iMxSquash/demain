// One schema per modification type (DOMAIN, Scenario and modification): stored parameters are
// checked again on every evaluation, so a modification whose parameters no longer pass is invalid
// (D6) instead of throwing. Amounts are positive minor units, the type gives the direction (D7).

import { z } from "zod";

import type {
  CategoryBudgetChange,
  IncomeChange,
  InterestProjection,
  LifeEvent,
  Loan,
  ModificationType,
  OneOffPurchase,
  SavingsGoal,
  SubscriptionChange,
} from "./modification";

const MAX_LABEL_LENGTH = 80;
const MAX_LOAN_MONTHS = 600;
const MAX_RATE_BP = 10000;
const MIN_BUDGET_CHANGE_BP = -10000;
const MAX_BUDGET_CHANGE_BP = 100000;
export const MAX_LIFE_EVENT_CHILDREN = 20;
// At the highest rate, a month of interest is a twelfth of what remains: the principal plus that
// interest must stay a safe integer.
const MAX_LOAN_PRINCIPAL = Math.floor((Number.MAX_SAFE_INTEGER / 13) * 12);

const id = z.int().positive();

export const modificationLabelSchema = z.string().trim().min(1).max(MAX_LABEL_LENGTH);

export const oneOffPurchaseParameters = z.strictObject({
  accountId: id,
  date: z.iso.date(),
  amount: z.int().positive(),
  categoryId: id.nullable(),
}) satisfies z.ZodType<OneOffPurchase["parameters"]>;

const existingTarget = z.strictObject({ kind: z.literal("existing"), plannedItemId: id });
const newTarget = z.strictObject({
  kind: z.literal("new"),
  accountId: id,
  categoryId: id.nullable(),
});
const subscriptionTarget = z.discriminatedUnion("kind", [existingTarget, newTarget]);

// The amount is required with a rhythm and refused without one, even as an undefined key.
export const subscriptionChangeParameters = z.discriminatedUnion("mode", [
  z.strictObject({
    target: subscriptionTarget,
    mode: z.enum(["monthly", "yearly"]),
    amount: z.int().positive(),
    startDate: z.iso.date(),
  }),
  z.strictObject({ target: subscriptionTarget, mode: z.literal("none"), startDate: z.iso.date() }),
]) satisfies z.ZodType<SubscriptionChange["parameters"]>;

export const loanParameters = z.strictObject({
  principal: z.int().positive().max(MAX_LOAN_PRINCIPAL),
  months: z.int().min(1).max(MAX_LOAN_MONTHS),
  annualRateBp: z.int().min(0).max(MAX_RATE_BP),
  receivedOn: z.iso.date(),
  paymentAccountId: id,
  principalAccountId: id.nullable(),
  categoryId: id.nullable(),
}) satisfies z.ZodType<Loan["parameters"]>;

const newAmount = z.strictObject({ kind: z.literal("amount"), amount: z.int().positive() });

// An end has no meaning for a new income: only an existing target accepts it.
export const incomeChangeParameters = z.union([
  z.strictObject({
    target: existingTarget,
    change: z.discriminatedUnion("kind", [newAmount, z.strictObject({ kind: z.literal("end") })]),
    effectiveDate: z.iso.date(),
  }),
  z.strictObject({ target: newTarget, change: newAmount, effectiveDate: z.iso.date() }),
]) satisfies z.ZodType<IncomeChange["parameters"]>;

// The first transfer is compared with today when the goal applies, since the schema has no today.
export const savingsGoalParameters = z
  .strictObject({
    sourceAccountId: id,
    savingsAccountId: id,
    firstTransferDate: z.iso.date(),
    mode: z.discriminatedUnion("kind", [
      z.strictObject({
        kind: z.literal("monthly"),
        amount: z.int().positive(),
        endDate: z.iso.date().nullable(),
      }),
      z.strictObject({
        kind: z.literal("target"),
        targetAmount: z.int().positive(),
        targetDate: z.iso.date(),
      }),
    ]),
  })
  .refine(({ sourceAccountId, savingsAccountId }) => sourceAccountId !== savingsAccountId)
  .refine(({ firstTransferDate, mode }) => {
    const lastDate = mode.kind === "monthly" ? mode.endDate : mode.targetDate;
    return lastDate === null || lastDate >= firstTransferDate;
  }) satisfies z.ZodType<SavingsGoal["parameters"]>;

// The start date is compared with today when the projection applies, since the schema has no today.
export const interestProjectionParameters = z.strictObject({
  accountId: id,
  annualRateBp: z.int().min(0).max(MAX_RATE_BP),
  frequency: z.enum(["monthly", "yearly"]),
  startDate: z.iso.date(),
}) satisfies z.ZodType<InterestProjection["parameters"]>;

// The start month is compared with the month of today when the change applies, since the schema has
// no today.
export const categoryBudgetChangeParameters = z.strictObject({
  accountId: id,
  categoryId: id.nullable(),
  startMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  change: z.discriminatedUnion("kind", [
    z.strictObject({
      kind: z.literal("percent"),
      basisPoints: z.int().min(MIN_BUDGET_CHANGE_BP).max(MAX_BUDGET_CHANGE_BP),
    }),
    z.strictObject({ kind: z.literal("amount"), monthlyAmount: z.int().min(0) }),
  ]),
}) satisfies z.ZodType<CategoryBudgetChange["parameters"]>;

/** A life event carries nothing but its label and its children. */
export const lifeEventParameters = z.strictObject({}) satisfies z.ZodType<LifeEvent["parameters"]>;

/** Each type issue adds its schema here. A map, so that a stored type never reads a prototype key. */
const PARAMETER_SCHEMAS: ReadonlyMap<ModificationType, z.ZodType> = new Map<
  ModificationType,
  z.ZodType
>([
  ["one_off_purchase", oneOffPurchaseParameters],
  ["subscription_change", subscriptionChangeParameters],
  ["loan", loanParameters],
  ["income_change", incomeChangeParameters],
  ["savings_goal", savingsGoalParameters],
  ["interest_projection", interestProjectionParameters],
  ["category_budget_change", categoryBudgetChangeParameters],
  ["life_event", lifeEventParameters],
]);

export function parseModificationParameters(
  type: ModificationType,
  value: unknown,
): { ok: true; parameters: unknown } | { ok: false; reason: "parametersInvalid" } {
  const parsed = PARAMETER_SCHEMAS.get(type)?.safeParse(value);
  if (parsed === undefined || !parsed.success) return { ok: false, reason: "parametersInvalid" };
  return { ok: true, parameters: parsed.data };
}
