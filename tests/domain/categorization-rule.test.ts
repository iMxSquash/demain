import { describe, expect, it } from "vitest";

import {
  CategorizationRuleValidationError,
  findMatchingRule,
  parseRuleOperator,
  validateRuleValue,
  type CategorizationRule,
} from "../../src/domain/categorization-rule";

function rule(overrides: Partial<CategorizationRule> = {}): CategorizationRule {
  return {
    id: 1,
    operator: "contains",
    value: "carrefour",
    accountId: null,
    categoryId: 10,
    priority: 1,
    ...overrides,
  };
}

describe("findMatchingRule", () => {
  it("matches a label containing the value, whatever the case", () => {
    const rules = [rule({ value: "carrefour" })];

    const match = findMatchingRule(rules, {
      label: "CB CARREFOUR MARKET 12/03",
      accountId: 1,
    });

    expect(match?.categoryId).toBe(10);
  });

  it("lets the first matching rule of the list win", () => {
    const rules = [
      rule({ id: 2, value: "carrefour", categoryId: 10, priority: 1 }),
      rule({ id: 1, value: "market", categoryId: 20, priority: 2 }),
    ];

    const match = findMatchingRule(rules, {
      label: "Carrefour Market",
      accountId: 1,
    });

    expect(match?.id).toBe(2);
  });

  it("applies an account-restricted rule to that account only", () => {
    const rules = [rule({ accountId: 2 })];

    expect(
      findMatchingRule(rules, { label: "Carrefour", accountId: 1 }),
    ).toBeNull();
    expect(
      findMatchingRule(rules, { label: "Carrefour", accountId: 2 })?.id,
    ).toBe(1);
  });

  it("matches only the beginning of the label with starts_with", () => {
    const rules = [rule({ operator: "starts_with", value: "vir" })];

    expect(
      findMatchingRule(rules, { label: "VIR salary march", accountId: 1 }),
    ).not.toBeNull();
    expect(
      findMatchingRule(rules, { label: "Refund VIR salary", accountId: 1 }),
    ).toBeNull();
  });

  it("matches the whole label with equals, ignoring case and surrounding spaces", () => {
    const rules = [rule({ operator: "equals", value: "Netflix" })];

    expect(
      findMatchingRule(rules, { label: "  NETFLIX ", accountId: 1 }),
    ).not.toBeNull();
    expect(
      findMatchingRule(rules, { label: "Netflix.com", accountId: 1 }),
    ).toBeNull();
  });

  it("returns null when no rule matches", () => {
    const match = findMatchingRule([rule()], {
      label: "Monthly rent",
      accountId: 1,
    });

    expect(match).toBeNull();
  });
});

describe("validateRuleValue", () => {
  it("trims the value of a valid rule", () => {
    expect(validateRuleValue("  carrefour ")).toBe("carrefour");
  });

  it("rejects a blank value, which would match every label", () => {
    expect(() => validateRuleValue("   ")).toThrow(
      CategorizationRuleValidationError,
    );
  });
});

describe("parseRuleOperator", () => {
  it("accepts the three operators", () => {
    expect(parseRuleOperator("contains")).toBe("contains");
    expect(parseRuleOperator("starts_with")).toBe("starts_with");
    expect(parseRuleOperator("equals")).toBe("equals");
  });

  it("returns null for anything else", () => {
    expect(parseRuleOperator("regex")).toBeNull();
    expect(parseRuleOperator("")).toBeNull();
    expect(parseRuleOperator(null)).toBeNull();
  });
});
