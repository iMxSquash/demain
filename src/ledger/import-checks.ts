import { and, asc, eq, isNotNull } from "drizzle-orm";

import { lastMovementDate } from "../domain/batch-balance";
import { computeUnexplainedGap } from "../domain/balance-assertion";
import { proposeRules, type RuleProposal } from "../domain/import-rule-proposals";
import type { AppDatabase } from "../storage/database";
import { transactions } from "../storage/schema";
import { getAccount } from "./accounts";
import { getImportBatch } from "./import-batch-lookup";
import { createRule, listApplicableRules } from "./categorization-rules";
import { CategoryNotFoundError, listCategories } from "./categories";
import {
  listAccountMovements,
  saveBalanceAssertion,
  type BalanceAssertion,
} from "./balance-assertions";

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

/** Date of the last movement of a recorded file, YYYY-MM-DD. */
export function getBatchEndDate(db: AppDatabase, batchId: number): string {
  const endDate = lastMovementDate(
    db
      .select({ date: transactions.date })
      .from(transactions)
      .where(eq(transactions.importBatchId, batchId))
      .all()
      .map(({ date }) => date),
  );
  if (endDate === null) throw new ImportBatchWithoutMovementError(batchId);
  return endDate;
}

export function getBatchBalanceCheck(
  db: AppDatabase,
  batchId: number,
): BatchBalanceCheck {
  const batch = getImportBatch(db, batchId);
  const endDate = getBatchEndDate(db, batchId);

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
  return check.computedBalance - realBalance;
}

/**
 * Records the real balance read in the bank as a balance assertion dated on
 * the end of the file. The assertion rules are those of any other: the
 * account must be active and an assertion of the same day is replaced.
 */
export function recordBatchBalanceAssertion(
  db: AppDatabase,
  batchId: number,
  realBalance: number,
): BalanceAssertion {
  const { accountId, endDate } = getBatchBalanceCheck(db, batchId);
  return saveBalanceAssertion(db, {
    accountId,
    date: endDate,
    amount: realBalance,
    note: null,
  });
}

export interface BatchRuleProposal extends RuleProposal {
  categoryName: string;
  /** Category of the existing rule that would hide the proposal, see `shadowedBy`. */
  shadowingCategoryName: string | null;
}

function deriveRuleProposals(
  db: AppDatabase,
  batchId: number,
): { accountId: number; proposals: RuleProposal[] } {
  const batch = getImportBatch(db, batchId);

  const proposals = proposeRules({
    rows: db
      .select({
        label: transactions.label,
        kind: transactions.kind,
        categoryId: transactions.categoryId,
      })
      .from(transactions)
      .where(eq(transactions.importBatchId, batchId))
      .orderBy(asc(transactions.date), asc(transactions.id))
      .all(),
    rules: listApplicableRules(db),
    accountId: batch.accountId,
  });
  return { accountId: batch.accountId, proposals };
}

/**
 * Rules worth creating from the categorized rows of a recorded file: one
 * `equals` rule per distinct (label, category) pair that no applicable rule
 * already gives. Nothing is written.
 */
export function listRuleProposals(
  db: AppDatabase,
  batchId: number,
): BatchRuleProposal[] {
  const namesById = new Map(
    listCategories(db, { includeArchived: true }).map(({ id, name }) => [id, name]),
  );
  const nameOf = (categoryId: number): string => {
    const name = namesById.get(categoryId);
    if (name === undefined) throw new CategoryNotFoundError(categoryId);
    return name;
  };
  return deriveRuleProposals(db, batchId).proposals.map((proposal) => ({
    ...proposal,
    categoryName: nameOf(proposal.categoryId),
    shadowingCategoryName:
      proposal.shadowedBy === null ? null : nameOf(proposal.shadowedBy.categoryId),
  }));
}

/** Whether any movement of the file has a category: without one, no rule can be proposed. */
export function hasCategorizedRow(db: AppDatabase, batchId: number): boolean {
  return (
    db
      .select({ id: transactions.id })
      .from(transactions)
      .where(and(eq(transactions.importBatchId, batchId), isNotNull(transactions.categoryId)))
      .limit(1)
      .get() !== undefined
  );
}

/**
 * Creates a rule, scoped to the account of the file, for each selected key.
 * The proposals are derived again from the batch: a key that is not among
 * them (forged, or already covered since the page was shown) is ignored.
 * Either every selected rule is created or none is.
 */
export function saveRuleProposals(
  db: AppDatabase,
  batchId: number,
  selected: readonly string[],
): { created: number } {
  const { accountId, proposals } = deriveRuleProposals(db, batchId);
  const chosen = new Set(selected);
  const toCreate = proposals.filter((proposal) => chosen.has(proposal.key));
  // All or nothing. `db` is the one connection the transaction runs on, so
  // createRule writes inside it (same as undoImportBatch).
  db.transaction(() => {
    for (const proposal of toCreate) {
      createRule(db, {
        operator: "equals",
        value: proposal.label,
        accountId,
        categoryId: proposal.categoryId,
      });
    }
  });
  return { created: toCreate.length };
}
