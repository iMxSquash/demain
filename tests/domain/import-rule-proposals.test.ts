import { describe, expect, it } from "vitest";

import type { CategorizationRule } from "../../src/domain/categorization-rule";
import {
  proposeRules,
  type ProposalRow,
} from "../../src/domain/import-rule-proposals";

const ACCOUNT_ID = 1;
const GROCERIES = 10;
const LEISURE = 20;

function row(overrides: Partial<ProposalRow> = {}): ProposalRow {
  return { label: "Card Shop", kind: "expense", categoryId: GROCERIES, ...overrides };
}

function rule(overrides: Partial<CategorizationRule> = {}): CategorizationRule {
  return {
    id: 1,
    operator: "equals",
    value: "card shop",
    accountId: ACCOUNT_ID,
    categoryId: GROCERIES,
    priority: 1,
    ...overrides,
  };
}

function propose(rows: ProposalRow[], rules: CategorizationRule[] = []) {
  return proposeRules({ rows, rules, accountId: ACCOUNT_ID });
}

describe("proposeRules", () => {
  it("proposes a pair shared by two rows once", () => {
    const proposals = propose([row(), row({ label: "  CARD SHOP " })]);

    expect(proposals).toHaveLength(1);
    expect(proposals[0]).toMatchObject({ label: "card shop", categoryId: GROCERIES });
  });

  it("does not propose a pair already covered by a rule of the same account", () => {
    expect(propose([row()], [rule()])).toEqual([]);
  });

  it("does not propose a pair already covered by a global rule", () => {
    expect(propose([row()], [rule({ accountId: null, operator: "contains", value: "shop" })])).toEqual([]);
  });

  it("still proposes a pair covered only by a rule of another account", () => {
    expect(propose([row()], [rule({ accountId: 2 })])).toHaveLength(1);
  });

  it("proposes the same label with another category than the existing rule", () => {
    const proposals = propose([row({ categoryId: LEISURE })], [rule()]);

    expect(proposals).toHaveLength(1);
    expect(proposals[0]?.categoryId).toBe(LEISURE);
  });

  it("ignores transfers and rows without a category", () => {
    const proposals = propose([
      row({ kind: "transfer", categoryId: GROCERIES }),
      row({ label: "Other", categoryId: null }),
    ]);

    expect(proposals).toEqual([]);
  });

  it("ignores a blank label", () => {
    expect(propose([row({ label: "   " })])).toEqual([]);
  });

  it("gives distinct keys to distinct pairs", () => {
    const proposals = propose([row(), row({ categoryId: LEISURE }), row({ label: "Bakery" })]);

    expect(new Set(proposals.map(({ key }) => key)).size).toBe(3);
  });
});
