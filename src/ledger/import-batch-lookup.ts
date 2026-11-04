import { eq } from "drizzle-orm";

import type { AppDatabase } from "../storage/database";
import { importBatches } from "../storage/schema";

export class ImportBatchNotFoundError extends Error {
  constructor(id: number) {
    super(`Import batch ${id} does not exist`);
    this.name = "ImportBatchNotFoundError";
  }
}

export function getImportBatch(
  reader: Pick<AppDatabase, "select">,
  batchId: number,
): typeof importBatches.$inferSelect {
  const batch = reader
    .select()
    .from(importBatches)
    .where(eq(importBatches.id, batchId))
    .get();
  if (batch === undefined) throw new ImportBatchNotFoundError(batchId);
  return batch;
}
