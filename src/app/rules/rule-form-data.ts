import {
  CategorizationRuleValidationError,
  parseRuleOperator,
  validateRuleValue,
  type RuleOperator,
} from "../../domain/categorization-rule";
import { messageRef, type Translate } from "../../domain/message";
import { parseCategoryChoice } from "../categories/category-form-data";

export type RuleFormField = "operator" | "value" | "accountId" | "categoryId";

export interface RuleFormValues {
  operator: string;
  value: string;
  /** Account id as text, blank means every account. */
  accountId: string;
  categoryId: string;
}

export interface RuleFormState {
  field?: RuleFormField;
  message: string;
  /** What the user typed: React resets the form after an action, so it is sent back. */
  values: RuleFormValues;
}

export interface RuleFormInput {
  operator: RuleOperator;
  value: string;
  accountId: number | null;
  categoryId: number;
}

export type ParsedRuleForm =
  | { ok: true; input: RuleFormInput }
  | { ok: false; field: RuleFormField; message: string };

type ParsedRuleCondition =
  | { ok: true; operator: RuleOperator; value: string }
  | { ok: false; field: "operator" | "value"; message: string };

function readText(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export function readRuleFormValues(formData: FormData): RuleFormValues {
  return {
    operator: readText(formData, "operator"),
    value: readText(formData, "value"),
    accountId: readText(formData, "accountId"),
    categoryId: readText(formData, "categoryId"),
  };
}

/** What a rule matches on, shared by the rule form and the suggestion made while categorizing. */
function parseRuleCondition(
  rawOperator: string,
  rawValue: string,
  translate: Translate,
): ParsedRuleCondition {
  const operator = parseRuleOperator(rawOperator);
  if (operator === null) {
    return {
      ok: false,
      field: "operator",
      message: translate(messageRef("ruleOperatorUnknown")),
    };
  }
  try {
    return { ok: true, operator, value: validateRuleValue(rawValue) };
  } catch (error) {
    if (error instanceof CategorizationRuleValidationError) {
      return { ok: false, field: error.field, message: translate(error.ref) };
    }
    throw error;
  }
}

export function parseRuleInput(
  formData: FormData,
  translate: Translate,
): ParsedRuleForm {
  const values = readRuleFormValues(formData);
  const condition = parseRuleCondition(values.operator, values.value, translate);
  if (!condition.ok) return condition;

  const category = parseCategoryChoice(formData, translate);
  if (!category.ok) {
    return { ok: false, field: "categoryId", message: category.message };
  }

  const accountId = values.accountId.trim() === "" ? null : Number(values.accountId);
  if (accountId !== null && !Number.isSafeInteger(accountId)) {
    return {
      ok: false,
      field: "accountId",
      message: translate(messageRef("ruleAccountUnknown")),
    };
  }

  return {
    ok: true,
    input: {
      operator: condition.operator,
      value: condition.value,
      accountId,
      categoryId: category.categoryId,
    },
  };
}

export type ParsedRuleSuggestion =
  | { ok: true; rule: { operator: RuleOperator; value: string } | null }
  | { ok: false; message: string };

/** The rule offered next to a manual categorization: none unless the box is ticked. */
export function parseRuleSuggestion(
  formData: FormData,
  translate: Translate,
): ParsedRuleSuggestion {
  if (formData.get("createRule") === null) return { ok: true, rule: null };

  const condition = parseRuleCondition(
    readText(formData, "ruleOperator"),
    readText(formData, "ruleValue"),
    translate,
  );
  if (!condition.ok) return { ok: false, message: condition.message };
  return { ok: true, rule: { operator: condition.operator, value: condition.value } };
}
