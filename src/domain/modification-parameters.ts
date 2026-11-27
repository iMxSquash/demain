// One schema per modification type (DOMAIN, Scenario and modification): stored parameters are
// checked again on every evaluation, so a modification whose parameters no longer pass is invalid
// (D6) instead of throwing. Amounts are positive minor units, the type gives the direction (D7).

import { z } from "zod";

import type { ModificationType, OneOffPurchase } from "./modification";

const MAX_LABEL_LENGTH = 80;

const id = z.int().positive();

export const modificationLabelSchema = z.string().trim().min(1).max(MAX_LABEL_LENGTH);

export const oneOffPurchaseParameters = z.strictObject({
  accountId: id,
  date: z.iso.date(),
  amount: z.int().positive(),
  categoryId: id.nullable(),
}) satisfies z.ZodType<OneOffPurchase["parameters"]>;

/** Each type issue adds its schema here. A map, so that a stored type never reads a prototype key. */
const PARAMETER_SCHEMAS: ReadonlyMap<ModificationType, z.ZodType> = new Map([
  ["one_off_purchase", oneOffPurchaseParameters],
]);

export function parseModificationParameters(
  type: ModificationType,
  value: unknown,
): { ok: true; parameters: unknown } | { ok: false; reason: "parametersInvalid" } {
  const parsed = PARAMETER_SCHEMAS.get(type)?.safeParse(value);
  if (parsed === undefined || !parsed.success) return { ok: false, reason: "parametersInvalid" };
  return { ok: true, parameters: parsed.data };
}
