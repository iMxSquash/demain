import { and, count, desc, eq, max, ne } from "drizzle-orm";

import { findMatchingRule } from "../domain/categorization-rule";
import type { AppDatabase } from "../storage/database";
import { accounts, transactions } from "../storage/schema";
import { listApplicableRules } from "./categorization-rules";

type Reader = Pick<AppDatabase, "select">;

/** A label from the history, with the category the rules give it on each account. */
export interface LabelSuggestion {
  label: string;
  /** Account id to category id: an account with no matching rule is absent. */
  categoryByAccount: Record<number, number>;
}

const DEFAULT_SUGGESTION_LIMIT = 30;

/**
 * The labels already used by entered transactions, the most used first, then the most recent.
 * A transfer leg is left out: its label names a movement, not a spending.
 *
 * The category comes from the categorization rules (ADR-010), never from the category the label
 * once had: it is the same answer an import would give. It is computed for each account because
 * a rule can be limited to one, and the user can change the account after picking a label.
 */
export function listLabelSuggestions(
  db: Reader,
  accountIds: readonly number[],
  limit = DEFAULT_SUGGESTION_LIMIT,
): LabelSuggestion[] {
  const labels = db
    .select({ label: transactions.label })
    .from(transactions)
    .where(ne(transactions.kind, "transfer"))
    .groupBy(transactions.label)
    .orderBy(desc(count()), desc(max(transactions.date)), transactions.label)
    .limit(limit)
    .all();
  const rules = listApplicableRules(db);

  return labels.map(({ label }) => {
    const categoryByAccount: Record<number, number> = {};
    for (const accountId of accountIds) {
      const rule = findMatchingRule(rules, { label, accountId });
      if (rule !== null) categoryByAccount[accountId] = rule.categoryId;
    }
    return { label, categoryByAccount };
  });
}

/**
 * The open account of the transaction entered last, or null. "Last" is the order of entry, not
 * the date: a back-dated entry still counts. Imported transactions count too, since they are
 * entries on that account. A transfer is not a spending entry, so it does not count.
 */
export function getLastUsedAccountId(db: Reader): number | null {
  const last = db
    .select({ accountId: transactions.accountId })
    .from(transactions)
    .innerJoin(
      accounts,
      and(eq(accounts.id, transactions.accountId), eq(accounts.archived, false)),
    )
    .where(ne(transactions.kind, "transfer"))
    .orderBy(desc(transactions.id))
    .limit(1)
    .get();
  return last?.accountId ?? null;
}
