// One schema per modification type (DOMAIN, Scenario and modification): stored parameters are
// checked again on every evaluation, so a modification whose parameters no longer pass is invalid
// (D6) instead of throwing. Amounts are positive minor units, the type gives the direction (D7).

import { z } from "zod";

import type { Loan, ModificationType, OneOffPurchase, SubscriptionChange } from "./modification";

const MAX_LABEL_LENGTH = 80;
const MAX_LOAN_MONTHS = 600;
const MAX_RATE_BP = 10000;

const id = z.int().positive();

export const modificationLabelSchema = z.string().trim().min(1).max(MAX_LABEL_LENGTH);

export const oneOffPurchaseParameters = z.strictObject({
  accountId: id,
  date: z.iso.date(),
  amount: z.int().positive(),
  categoryId: id.nullable(),
}) satisfies z.ZodType<OneOffPurchase["parameters"]>;

const subscriptionTarget = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("existing"), plannedItemId: id }),
  z.strictObject({ kind: z.literal("new"), accountId: id, categoryId: id.nullable() }),
]);

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
  principal: z.int().positive(),
  months: z.int().min(1).max(MAX_LOAN_MONTHS),
  annualRateBp: z.int().min(0).max(MAX_RATE_BP),
  receivedOn: z.iso.date(),
  paymentAccountId: id,
  principalAccountId: id.nullable(),
  categoryId: id.nullable(),
}) satisfies z.ZodType<Loan["parameters"]>;

/** Each type issue adds its schema here. A map, so that a stored type never reads a prototype key. */
const PARAMETER_SCHEMAS: ReadonlyMap<ModificationType, z.ZodType> = new Map<
  ModificationType,
  z.ZodType
>([
  ["one_off_purchase", oneOffPurchaseParameters],
  ["subscription_change", subscriptionChangeParameters],
  ["loan", loanParameters],
]);

export function parseModificationParameters(
  type: ModificationType,
  value: unknown,
): { ok: true; parameters: unknown } | { ok: false; reason: "parametersInvalid" } {
  const parsed = PARAMETER_SCHEMAS.get(type)?.safeParse(value);
  if (parsed === undefined || !parsed.success) return { ok: false, reason: "parametersInvalid" };
  return { ok: true, parameters: parsed.data };
}
