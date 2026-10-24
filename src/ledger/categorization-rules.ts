import { and, asc, eq, getTableColumns, max } from "drizzle-orm";

import {
  validateRuleValue,
  type CategorizationRule,
} from "../domain/categorization-rule";
import type { AppDatabase } from "../storage/database";
import { categories, categorizationRules } from "../storage/schema";
import { getAccount } from "./accounts";
import { getCategory } from "./categories";

export class RuleNotFoundError extends Error {
  constructor(id: number) {
    super(`Categorization rule ${id} does not exist`);
    this.name = "RuleNotFoundError";
  }
}

type RuleReader = Pick<AppDatabase, "select">;

export interface NewRule {
  operator: CategorizationRule["operator"];
  value: string;
  accountId?: number | null;
  categoryId: number;
}

/** Rules in evaluation order. */
export function listRules(db: RuleReader): CategorizationRule[] {
  return db
    .select()
    .from(categorizationRules)
    .orderBy(asc(categorizationRules.priority))
    .all();
}

/**
 * The rules an import can apply. A rule pointing to an archived category is
 * kept but skipped: an archived category is never newly assigned.
 */
export function listApplicableRules(db: RuleReader): CategorizationRule[] {
  return db
    .select(getTableColumns(categorizationRules))
    .from(categorizationRules)
    .innerJoin(
      categories,
      and(
        eq(categories.id, categorizationRules.categoryId),
        eq(categories.archived, false),
      ),
    )
    .orderBy(asc(categorizationRules.priority))
    .all();
}

/** The caller has validated the value and checked that the category and account exist. */
export function insertRule(
  writer: Pick<AppDatabase, "select" | "insert">,
  rule: Omit<CategorizationRule, "id" | "priority">,
): CategorizationRule {
  const last = writer
    .select({ priority: max(categorizationRules.priority) })
    .from(categorizationRules)
    .get();
  return writer
    .insert(categorizationRules)
    .values({ ...rule, priority: (last?.priority ?? 0) + 1 })
    .returning()
    .get();
}

export function createRule(db: AppDatabase, input: NewRule): CategorizationRule {
  const value = validateRuleValue(input.value);
  const accountId = input.accountId ?? null;
  getCategory(db, input.categoryId);
  if (accountId !== null) getAccount(db, accountId);

  return insertRule(db, {
    operator: input.operator,
    value,
    accountId,
    categoryId: input.categoryId,
  });
}

/** Swaps the rule with its neighbour; the first rule cannot go up, nor the last go down. */
export function moveRule(
  db: AppDatabase,
  id: number,
  direction: "up" | "down",
): void {
  db.transaction((tx) => {
    const rules = listRules(tx);
    const index = rules.findIndex((candidate) => candidate.id === id);
    const rule = rules[index];
    if (rule === undefined) throw new RuleNotFoundError(id);
    const neighbour = rules[direction === "up" ? index - 1 : index + 1];
    if (neighbour === undefined) return;

    tx.update(categorizationRules)
      .set({ priority: neighbour.priority })
      .where(eq(categorizationRules.id, rule.id))
      .run();
    tx.update(categorizationRules)
      .set({ priority: rule.priority })
      .where(eq(categorizationRules.id, neighbour.id))
      .run();
  });
}

/** A rule carries no history, unlike a category: deleting it changes nothing already categorized. */
export function deleteRule(db: AppDatabase, id: number): void {
  const deleted = db
    .delete(categorizationRules)
    .where(eq(categorizationRules.id, id))
    .returning()
    .get();
  if (deleted === undefined) throw new RuleNotFoundError(id);
}
