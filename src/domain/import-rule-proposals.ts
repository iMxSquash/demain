/**
 * Categorization rules proposed from the rows of a recorded file. Pure
 * functions: no database, no clock. See DOMAIN, Importing files.
 */

import {
  findMatchingRule,
  readRuleLabel,
  type CategorizationRule,
} from "./categorization-rule";

export interface RuleProposal {
  /** Stable identity of the pair, sent back by the browser to select it. */
  key: string;
  /** The label as rules read it: the value of the `equals` rule to create. */
  label: string;
  categoryId: number;
  /**
   * The existing rule that matches the label but gives another category.
   * Rules are first match wins and a new rule goes last, so it would hide the
   * proposed one. Null when nothing hides it.
   */
  shadowedBy: CategorizationRule | null;
}

export interface ProposalRow {
  label: string;
  kind: "expense" | "income" | "interest" | "transfer";
  categoryId: number | null;
}

/**
 * The distinct (label, category) pairs of the categorized rows, whatever set
 * the category, that no rule already gives that category to, for the account
 * of the file. A pair that an existing rule of another category would hide is
 * still proposed, with that rule in `shadowedBy`. Transfers and rows without
 * a category carry nothing to learn from.
 */
export function proposeRules(input: {
  rows: readonly ProposalRow[];
  /** Applicable rules in evaluation order. */
  rules: readonly CategorizationRule[];
  accountId: number;
}): RuleProposal[] {
  const proposals = new Map<string, RuleProposal>();
  for (const row of input.rows) {
    if (row.kind === "transfer" || row.categoryId === null) continue;
    const label = readRuleLabel(row.label);
    if (label === "") continue;
    const key = `${row.categoryId}:${label}`;
    if (proposals.has(key)) continue;
    const covering = findMatchingRule(input.rules, {
      label,
      accountId: input.accountId,
    });
    if (covering?.categoryId === row.categoryId) continue;
    proposals.set(key, {
      key,
      label,
      categoryId: row.categoryId,
      shadowedBy: covering,
    });
  }
  return [...proposals.values()];
}
