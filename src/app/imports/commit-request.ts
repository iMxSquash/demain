import { z } from "zod";

import type { MovementType } from "../../domain/import-columns";
import type { RowDetails } from "../../domain/import-draft";
import { PAYMENT_MODES } from "../../domain/transaction";
import { csvMappingSchema } from "../../ledger/imports";

export const MAX_FILE_NAME_LENGTH = 255;
export const MAX_CELL_LENGTH = 1_000;
export const MAX_ROWS = 50_000;

const MOVEMENT_TYPES = [
  "expense",
  "income",
  "savings",
] as const satisfies readonly MovementType[];

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

export const commitRequestSchema = z.strictObject({
  accountId: id,
  fileName: z.string().max(MAX_FILE_NAME_LENGTH),
  format: z.enum(["csv", "ofx"]),
  mapping: csvMappingSchema.nullable(),
  /** The savings account of the savings rows that name none. */
  savingsAccountId: id.nullable().optional(),
  drafts: z.array(draftSchema).max(MAX_ROWS),
});

export type CommitStagedRequest = z.input<typeof commitRequestSchema>;
