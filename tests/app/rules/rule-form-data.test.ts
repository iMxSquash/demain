import { describe, expect, it } from "vitest";

import {
  parseRuleInput as parse,
  parseRuleSuggestion as parseSuggestion,
} from "../../../src/app/rules/rule-form-data";
import { translateKey } from "../translate-key";

const parseRuleInput = (formData: FormData) => parse(formData, translateKey);

function formOf(fields: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [name, value] of Object.entries(fields)) formData.set(name, value);
  return formData;
}

const VALID = {
  operator: "contains",
  value: " shop ",
  accountId: "",
  categoryId: "4",
};

describe("parseRuleInput", () => {
  it("reads a rule for every account", () => {
    expect(parseRuleInput(formOf(VALID))).toEqual({
      ok: true,
      input: { operator: "contains", value: "shop", accountId: null, categoryId: 4 },
    });
  });

  it("reads the account a rule is restricted to", () => {
    expect(parseRuleInput(formOf({ ...VALID, accountId: "2" }))).toMatchObject({
      ok: true,
      input: { accountId: 2 },
    });
  });

  it("refuses a missing category", () => {
    expect(parseRuleInput(formOf({ ...VALID, categoryId: "" }))).toMatchObject({
      ok: false,
      field: "categoryId",
    });
  });

  it("refuses a blank text", () => {
    expect(parseRuleInput(formOf({ ...VALID, value: "  " }))).toMatchObject({
      ok: false,
      field: "value",
    });
  });

  it("refuses an unknown operator", () => {
    expect(parseRuleInput(formOf({ ...VALID, operator: "regex" }))).toMatchObject({
      ok: false,
      field: "operator",
    });
  });

  it("refuses an account id that is not a whole number", () => {
    expect(parseRuleInput(formOf({ ...VALID, accountId: "1.5" }))).toMatchObject({
      ok: false,
      field: "accountId",
    });
  });
});

const parseRuleSuggestion = (formData: FormData) =>
  parseSuggestion(formData, translateKey);

describe("parseRuleSuggestion", () => {
  it("offers no rule when the box is not ticked", () => {
    expect(
      parseRuleSuggestion(
        formOf({ ruleOperator: "contains", ruleValue: "shop" }),
      ),
    ).toEqual({ ok: true, rule: null });
  });

  it("reads the operator and the trimmed text of a ticked suggestion", () => {
    expect(
      parseRuleSuggestion(
        formOf({
          createRule: "on",
          ruleOperator: "starts_with",
          ruleValue: "  VIR salary ",
        }),
      ),
    ).toEqual({ ok: true, rule: { operator: "starts_with", value: "VIR salary" } });
  });

  it("refuses a ticked suggestion without text", () => {
    expect(
      parseRuleSuggestion(
        formOf({ createRule: "on", ruleOperator: "contains", ruleValue: " " }),
      ),
    ).toMatchObject({ ok: false });
  });

  it("refuses a ticked suggestion with an unknown operator", () => {
    expect(
      parseRuleSuggestion(
        formOf({ createRule: "on", ruleOperator: "regex", ruleValue: "x" }),
      ),
    ).toMatchObject({ ok: false });
  });
});
