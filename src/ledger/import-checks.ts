import { eq } from "drizzle-orm";

import { lastMovementDate } from "../domain/batch-balance";
import { computeUnexplainedGap } from "../domain/balance-assertion";
import type { AppDatabase } from "../storage/database";
import { importBatches, transactions } from "../storage/schema";
import { getAccount } from "./accounts";
import { listAccountMovements } from "./balance-assertions";

export class ImportBatchNotFoundError extends Error {
  constructor(id: number) {
    super(`Import batch ${id} does not exist`);
    this.name = "ImportBatchNotFoundError";
  }
}

export class ImportBatchWithoutMovementError extends Error {
  constructor(id: number) {
    super(`Import batch ${id} has no movement left`);
    this.name = "ImportBatchWithoutMovementError";
  }
}

/** What Demain computes for the account of a file on the day the file ends. */
export interface BatchBalanceCheck {
  batchId: number;
  accountId: number;
  currency: string;
  /** Date of the last movement of the file, YYYY-MM-DD. */
  endDate: string;
  /** Opening balance plus every movement of the account up to the end date, in minor units. */
  computedBalance: number;
}

export function getBatchBalanceCheck(
  db: AppDatabase,
  batchId: number,
): BatchBalanceCheck {
  const batch = db
    .select({ accountId: importBatches.accountId })
    .from(importBatches)
    .where(eq(importBatches.id, batchId))
    .get();
  if (batch === undefined) throw new ImportBatchNotFoundError(batchId);

  const endDate = lastMovementDate(
    db
      .select({ date: transactions.date })
      .from(transactions)
      .where(eq(transactions.importBatchId, batchId))
      .all()
      .map(({ date }) => date),
  );
  if (endDate === null) throw new ImportBatchWithoutMovementError(batchId);

  const account = getAccount(db, batch.accountId);
  const { computedBalance } = computeUnexplainedGap(
    account,
    listAccountMovements(db, account.id),
    // The amount only matters for the gap, which is taken from the real balance later.
    { date: endDate, amount: 0 },
  );
  return {
    batchId,
    accountId: account.id,
    currency: account.currency,
    endDate,
    computedBalance,
  };
}

/** Computed balance minus the real one: positive when Demain holds more than the bank. */
export function batchBalanceGap(
  check: BatchBalanceCheck,
  realBalance: number,
): number {
  // The balance is already computed up to the end date: no movement is left to add.
  return computeUnexplainedGap(
    { id: check.accountId, openingBalance: check.computedBalance },
    [],
    { date: check.endDate, amount: realBalance },
  ).gap;
}
