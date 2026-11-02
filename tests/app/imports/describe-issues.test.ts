import { describe, expect, it } from "vitest";

import { describeImportIssue } from "../../../src/app/imports/describe-issues";
import { messageRef } from "../../../src/domain/message";
import type { ImportIssue } from "../../../src/ledger/imports";
import { sayIn } from "./say";

const ISSUES: ImportIssue[] = [
  { kind: "savingsAmountInvalid", index: 0 },
  { kind: "savingsUnplaced", index: 0, amount: 20_000 },
  { kind: "overflowChainCycle" },
  { kind: "rowProblem", index: 1, problem: "typeSignMismatch" },
  { kind: "rowProblem", index: 0, problem: "savingsAccountRequired" },
  { kind: "rowInvalid", index: 1, ref: messageRef("importSavingsAccountArchived") },
];

describe.each(["en", "fr"] as const)("describing import issues in %s", (locale) => {
  const say = sayIn(locale);

  it("writes a sentence for every kind of issue", () => {
    for (const issue of ISSUES) {
      expect(describeImportIssue(issue, say).message, issue.kind).not.toBe("");
    }
  });
});

describe("where an issue is", () => {
  const say = sayIn("en");

  it("names the row of an issue and says where it is", () => {
    expect(
      describeImportIssue({ kind: "rowInvalid", index: 1, ref: messageRef("importCategoryUnknown") }, say),
    ).toEqual({
      index: 1,
      message: "CARD SHOP (Mar 2, 2026): <importCategoryUnknown>",
    });
  });

  it("shows the part of a savings row that fits nowhere, in the currency of the account", () => {
    const { message } = describeImportIssue(
      { kind: "savingsUnplaced", index: 0, amount: 20_000 },
      say,
    );

    expect(message).toContain("VIR LIVRET (Mar 10, 2026)");
    expect(message).toContain("€200.00");
  });

  it("points at no row for a loop in the chain, which belongs to the accounts", () => {
    expect(describeImportIssue({ kind: "overflowChainCycle" }, say).index).toBeNull();
  });
});
