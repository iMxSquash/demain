import { eq, inArray } from "drizzle-orm";

import { digestBatchTransactions } from "../domain/import-digest";
import type { AppDatabase } from "../storage/database";
import { importBatches, transactions } from "../storage/schema";
import { getImportBatch } from "./import-batch-lookup";
import { getOpenAccount } from "./transactions";

export class ImportBatchUnverifiableError extends Error {
  constructor(id: number) {
    super(`Import batch ${id} was recorded without a digest: its content cannot be verified`);
    this.name = "ImportBatchUnverifiableError";
  }
}

export class ImportBatchChangedError extends Error {
  constructor(id: number) {
    super(`Import batch ${id} changed since it was recorded`);
    this.name = "ImportBatchChangedError";
  }
}

/**
 * Removes a recorded file as a whole: its transactions (both legs of a
 * transfer) and the batch, in one database transaction. Refused, with nothing
 * removed, when the batch cannot be verified, when any of its transactions
 * changed or disappeared since it was recorded, or when an account it touches
 * is archived. Returns the number of transactions removed. The rules, the
 * balance assertions and the overflow accounts created with the file stay.
 */
export function undoImportBatch(db: AppDatabase, batchId: number): number {
  return db.transaction((tx) => {
    const batch = getImportBatch(tx, batchId);
    if (batch.contentDigest === null) throw new ImportBatchUnverifiableError(batchId);

    const rows = tx
      .select()
      .from(transactions)
      .where(eq(transactions.importBatchId, batchId))
      .all();
    if (digestBatchTransactions(rows) !== batch.contentDigest) {
      throw new ImportBatchChangedError(batchId);
    }

    // Same guard as deleteTransaction: an archived account keeps a zero balance.
    // `db` is the one connection the transaction runs on, it reads the same state.
    getOpenAccount(db, batch.accountId);
    for (const accountId of new Set(rows.map((row) => row.accountId))) {
      getOpenAccount(db, accountId);
    }

    // One statement: the legs reference each other, and SQLite checks the
    // foreign key at the end of the statement.
    tx.delete(transactions)
      .where(inArray(transactions.id, rows.map((row) => row.id)))
      .run();
    tx.delete(importBatches).where(eq(importBatches.id, batchId)).run();
    return rows.length;
  });
}
