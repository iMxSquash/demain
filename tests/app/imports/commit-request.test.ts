import { describe, expect, it } from "vitest";

import {
  MAX_CELL_LENGTH,
  commitRequestSchema,
} from "../../../src/app/imports/commit-request";

const DETAILS = {
  type: "expense",
  categoryId: 4,
  paymentMode: "card",
  description: "weekly shop",
  savingsAccountId: null,
};

const DRAFT = {
  date: "2026-03-02",
  label: "CARD SHOP",
  amount: "-12,50",
  externalId: null,
};

function request(overrides: Record<string, unknown> = {}) {
  return {
    accountId: 1,
    fileName: "2026-03.csv",
    format: "csv",
    mapping: null,
    drafts: [{ ...DRAFT, details: DETAILS }],
    ...overrides,
  };
}

const parse = (value: unknown) => commitRequestSchema.safeParse(value);

describe("commitRequestSchema", () => {
  it("keeps the details of a draft and the savings account of the request", () => {
    const result = parse(request({ savingsAccountId: 2 }));

    expect(result.success).toBe(true);
    expect(result.data?.savingsAccountId).toBe(2);
    expect(result.data?.drafts[0]?.details).toEqual(DETAILS);
  });

  it("accepts drafts with no details, and no savings account", () => {
    expect(parse(request({ drafts: [DRAFT] })).success).toBe(true);
    expect(parse(request({ savingsAccountId: null })).success).toBe(true);
  });

  it("accepts every type, payment mode and null that the details allow", () => {
    for (const type of ["expense", "income", "savings"]) {
      expect(parse(request({ drafts: [{ ...DRAFT, details: { ...DETAILS, type } }] })).success).toBe(true);
    }
    for (const paymentMode of ["card", "transfer", "direct_debit", null]) {
      expect(parse(request({ drafts: [{ ...DRAFT, details: { ...DETAILS, paymentMode } }] })).success).toBe(true);
    }
    expect(
      parse(request({ drafts: [{ ...DRAFT, details: { ...DETAILS, categoryId: null, description: null } }] })).success,
    ).toBe(true);
  });

  it.each([
    ["an unknown type", { type: "refund" }],
    ["a category id of zero", { categoryId: 0 }],
    ["a negative category id", { categoryId: -3 }],
    ["a fractional category id", { categoryId: 1.5 }],
    ["a category id given as text", { categoryId: "4" }],
    ["an unknown payment mode", { paymentMode: "cash" }],
    ["a description above the limit", { description: "x".repeat(MAX_CELL_LENGTH + 1) }],
    ["a savings account id of zero", { savingsAccountId: 0 }],
    ["a fractional savings account id", { savingsAccountId: 2.5 }],
    ["a field the details do not have", { isAdmin: true }],
  ])("refuses details with %s", (_name, change) => {
    const drafts = [{ ...DRAFT, details: { ...DETAILS, ...change } }];

    expect(parse(request({ drafts })).success).toBe(false);
  });

  it("refuses a description at the limit plus one, but accepts the limit itself", () => {
    const at = (length: number) => ({
      drafts: [{ ...DRAFT, details: { ...DETAILS, description: "x".repeat(length) } }],
    });

    expect(parse(request(at(MAX_CELL_LENGTH))).success).toBe(true);
    expect(parse(request(at(MAX_CELL_LENGTH + 1))).success).toBe(false);
  });

  it.each([
    ["an account id of zero", { accountId: 0 }],
    ["a savings account id of zero on the request", { savingsAccountId: 0 }],
    ["a field the request does not have", { extra: 1 }],
    ["a field a draft does not have", { drafts: [{ ...DRAFT, extra: 1 }] }],
    ["details with a missing field", { drafts: [{ ...DRAFT, details: { type: "expense" } }] }],
  ])("refuses %s", (_name, change) => {
    expect(parse(request(change)).success).toBe(false);
  });
});
