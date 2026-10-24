/**
 * Categorization rules. Pure functions: no database, no clock. See DOMAIN,
 * entity Category and categorization rule, and ADR-010.
 */

import { messageRef, type MessageRef } from "./message";

export const RULE_OPERATORS = ["contains", "starts_with", "equals"] as const;

export type RuleOperator = (typeof RULE_OPERATORS)[number];

export function parseRuleOperator(raw: unknown): RuleOperator | null {
  return RULE_OPERATORS.find((operator) => operator === raw) ?? null;
}

export interface CategorizationRule {
  id: number;
  operator: RuleOperator;
  /** Text compared with the label, case-insensitively. */
  value: string;
  /** Null: the rule applies to every account. */
  accountId: number | null;
  categoryId: number;
  /** Lower comes first: the first matching rule wins. */
  priority: number;
}

export interface RuleSubject {
  label: string;
  accountId: number;
}

function matches(
  rule: CategorizationRule,
  subject: RuleSubject,
  label: string,
): boolean {
  if (rule.accountId !== null && rule.accountId !== subject.accountId) {
    return false;
  }
  const value = rule.value.toLowerCase();
  switch (rule.operator) {
    case "contains":
      return label.includes(value);
    case "starts_with":
      return label.startsWith(value);
    case "equals":
      return label === value;
  }
}

/**
 * The first rule that matches. `rules` must already be in evaluation order
 * (ascending priority): the ledger returns them that way, and sorting here
 * would repeat the work for every imported row.
 */
export function findMatchingRule(
  rules: readonly CategorizationRule[],
  subject: RuleSubject,
): CategorizationRule | null {
  const label = subject.label.trim().toLowerCase();
  return rules.find((rule) => matches(rule, subject, label)) ?? null;
}

export class CategorizationRuleValidationError extends Error {
  readonly field = "value";

  constructor(
    /** English text for logs and tests: users read the translation of `ref`. */
    message: string,
    readonly ref: MessageRef,
  ) {
    super(message);
    this.name = "CategorizationRuleValidationError";
  }
}

/** A blank value would match every label, so it is refused. */
export function validateRuleValue(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new CategorizationRuleValidationError(
      "The rule value is required",
      messageRef("ruleValueRequired"),
    );
  }
  return trimmed;
}
