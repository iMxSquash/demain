import { z } from "zod";

import { MOVEMENT_TYPES } from "../../domain/import-columns";
import type { RowDetails } from "../../domain/import-draft";
import { PAYMENT_MODES } from "../../domain/transaction";
import { csvMappingSchema } from "../../ledger/imports";

export const MAX_FILE_NAME_LENGTH = 255;
export const MAX_CELL_LENGTH = 1_000;
export const MAX_ROWS = 50_000;
const MAX_ACCOUNT_NAME_LENGTH = 200;
const MAX_OVERFLOW_CHOICES = 1_000;

const id = z.number().int().min(1);

// Strict objects: the browser is not trusted, and a field the server does not
// know is refused instead of being silently dropped.
const rowDetailsSchema: z.ZodType<RowDetails> = z.strictObject({
  type: z.enum(MOVEMENT_TYPES),
  categoryId: id.nullable(),
  paymentMode: z.enum(PAYMENT_MODES).nullable(),
  description: z.string().max(MAX_CELL_LENGTH).nullable(),
  savingsAccountId: id.nullable(),
});

const draftSchema = z.strictObject({
  date: z.string().max(MAX_CELL_LENGTH),
  label: z.string().max(MAX_CELL_LENGTH),
  amount: z.string().max(MAX_CELL_LENGTH),
  externalId: z.string().max(MAX_CELL_LENGTH).nullable(),
  details: rowDetailsSchema.optional(),
});

const overflowChoiceSchema = z.strictObject({
  accountId: id,
  target: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("existing"), id }),
    z.strictObject({ kind: z.literal("new"), name: z.string().max(MAX_ACCOUNT_NAME_LENGTH) }),
  ]),
});

export const commitRequestSchema = z.strictObject({
  accountId: id,
  fileName: z.string().max(MAX_FILE_NAME_LENGTH),
  format: z.enum(["csv", "ofx"]),
  mapping: csvMappingSchema.nullable(),
  /** The savings account of the savings rows that name none. */
  savingsAccountId: id.nullable().optional(),
  drafts: z.array(draftSchema).max(MAX_ROWS),
  /** The overflow accounts chosen in the review: saved with the file, or not at all. */
  overflowChoices: z.array(overflowChoiceSchema).max(MAX_OVERFLOW_CHOICES).optional(),
});

export type CommitStagedRequest = z.input<typeof commitRequestSchema>;
