import { describe, expect, it } from "vitest";

import {
  describeSummaryIssue,
  describeVerificationIssue,
} from "../../../src/app/balances/summary/describe-issues";
import { messageRef } from "../../../src/domain/message";
import type { SummaryIssue } from "../../../src/domain/sheet-summary";
import type { VerificationIssue } from "../../../src/domain/sheet-verification";
import { sayIn } from "./say";

const REF = messageRef("importLabelRequired");

const SUMMARY_COLUMNS = [
  "month",
  "net",
  "savings",
  "cumulativeSavings",
  "cumulativeAccount",
  "savingsBalance",
  "realAccountBalance",
] as const;

const SUMMARY_ISSUES: SummaryIssue[] = [
  { kind: "emptyFile" },
  { kind: "delimiterNotFound" },
  { kind: "unreadableFile", ref: REF, line: null },
  ...SUMMARY_COLUMNS.map(
    (column): SummaryIssue => ({ kind: "columnNotFound", column }),
  ),
  { kind: "unrecognizedColumn", column: 2, header: "Notes" },
  ...SUMMARY_COLUMNS.map(
    (column): SummaryIssue => ({ kind: "ambiguousColumn", column, columns: [1, 2] }),
  ),
  { kind: "monthUnreadable", line: 9, text: "Total" },
  { kind: "monthYearMissing", line: 2, text: "January" },
  { kind: "amountUnreadable", line: 2, column: "net", text: "abc" },
];

const VERIFICATION_ISSUES: VerificationIssue[] = [
  { kind: "monthMissingInSheet", month: "2026-02" },
  { kind: "monthMissingInDemain", month: "2026-02" },
  { kind: "duplicateSheetMonth", month: "2026-02" },
  { kind: "figureMissingInSheet", month: "2026-02", figure: "savingsBalance" },
];

describe.each(["en", "fr"] as const)("describing issues in %s", (locale) => {
  const say = sayIn(locale);

  it("writes a sentence for every kind of Summary issue", () => {
    for (const issue of SUMMARY_ISSUES) {
      expect(describeSummaryIssue("summary.csv", issue, say), issue.kind).not.toBe("");
    }
  });

  it("writes a sentence for every kind of verification issue", () => {
    for (const issue of VERIFICATION_ISSUES) {
      expect(describeVerificationIssue(issue, say), issue.kind).not.toBe("");
    }
  });
});

describe("where a problem is", () => {
  const say = sayIn("en");

  it("names the file and the line of a row", () => {
    expect(
      describeSummaryIssue("summary.csv", { kind: "monthUnreadable", line: 9, text: "Total" }, say),
    ).toBe('summary.csv, line 9: Summary row skipped: "Total" is not a month.');
  });

  it("names only the file when the problem is about the whole file", () => {
    expect(describeSummaryIssue("summary.csv", { kind: "emptyFile" }, say)).toBe(
      "summary.csv: The file is empty.",
    );
  });

  it("numbers the columns from 1, as in a spreadsheet", () => {
    expect(
      describeSummaryIssue(
        "summary.csv",
        { kind: "ambiguousColumn", column: "net", columns: [1, 2, 3] },
        say,
      ),
    ).toContain("column 2 is used, not 3, 4");
  });
});
