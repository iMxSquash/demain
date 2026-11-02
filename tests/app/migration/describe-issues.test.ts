import { describe, expect, it } from "vitest";

import { messageRef } from "../../../src/domain/message";
import type { SheetTabIssue } from "../../../src/domain/sheet-tab";
import type { SummaryIssue } from "../../../src/domain/sheet-summary";
import type { VerificationIssue } from "../../../src/domain/sheet-verification";
import type {
  MigrationIssue,
  MigrationNotice,
} from "../../../src/ledger/sheet-migration";
import {
  describeIgnoredMonths,
  describeMigrationIssue,
  describeNotice,
  describeSummaryIssue,
  describeTabIssue,
  describeVerificationIssue,
} from "../../../src/app/migration/describe-issues";
import { sayIn } from "./say";

const REF = messageRef("importLabelRequired");

const TAB_ISSUES: SheetTabIssue[] = [
  { kind: "emptyFile" },
  { kind: "delimiterNotFound" },
  { kind: "unreadableFile", ref: REF, line: 4 },
  { kind: "mappingColumnNotFound", role: "date" },
  { kind: "mappingColumnNotFound", role: "label" },
  { kind: "mappingColumnNotFound", role: "amount" },
  { kind: "dateFormatNotFound" },
  { kind: "dateFormatAmbiguous", format: "dmy" },
  { kind: "dateFormatAmbiguous", format: "mdy" },
  { kind: "dateFormatAmbiguous", format: "ymd" },
  { kind: "dateYearMissing" },
  { kind: "dateYearAssumed", year: 2026 },
  { kind: "columnNotFound", role: "type" },
  { kind: "columnNotFound", role: "paymentMode" },
  { kind: "columnNotFound", role: "category" },
  { kind: "ambiguousColumn", role: "type", column: 3, alsoMatching: [4, 5] },
  { kind: "ambiguousColumn", role: "paymentMode", column: 3, alsoMatching: [4] },
  { kind: "unrecognizedValue", role: "type", value: "Refund", lines: [3, 5] },
  { kind: "unrecognizedValue", role: "paymentMode", value: "Cash", lines: [3] },
  { kind: "rowUnreadable", line: 3, ref: REF },
  { kind: "typeUnrecognized", line: 3, value: "Refund" },
  { kind: "typeMissing", line: 4 },
  { kind: "columnsIgnored", columns: [5, 6] },
  { kind: "rowsIgnored", reason: "beforeHeader", lines: [1, 2] },
  { kind: "rowsIgnored", reason: "total", lines: [9] },
  { kind: "numberFormatAmbiguous", mark: "," },
  { kind: "numberFormatAmbiguous", mark: "." },
  { kind: "labelFromCategory", line: 3, category: "Food" },
];

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

const LEDGER_ISSUES: MigrationIssue[] = [
  { kind: "savingsAmountInvalid", source: "january.csv", line: 3 },
  { kind: "savingsUnplaced", source: "january.csv", line: 3, amount: 35_000 },
  { kind: "overflowChainCycle" },
  { kind: "accountArchived", accountId: 1 },
  { kind: "ledgerNotEmpty", accountId: 1 },
  {
    kind: "categoryArchived",
    name: "Food",
    rows: [{ source: "january.csv", line: 2 }],
  },
  { kind: "rowInvalid", source: "january.csv", line: 4, field: "date", ref: REF },
  { kind: "assertionInvalid", month: "2025-11", field: "date", ref: REF },
];

const NOTICES: MigrationNotice[] = [
  { kind: "assertionSkipped", month: "2026-02" },
  { kind: "ruleConflict", label: "Gift", categories: ["Food", "Presents"] },
  { kind: "ruleExists", label: "Carrefour" },
  { kind: "summaryNotProvided" },
];

const VERIFICATION_ISSUES: VerificationIssue[] = [
  { kind: "monthMissingInSheet", month: "2026-02" },
  { kind: "monthMissingInDemain", month: "2026-02" },
  { kind: "duplicateSheetMonth", month: "2026-02" },
  { kind: "figureMissingInSheet", month: "2026-02", figure: "savingsBalance" },
];

describe.each(["en", "fr"] as const)("describing issues in %s", (locale) => {
  const say = sayIn(locale);

  it("writes a sentence for every kind of tab issue", () => {
    for (const issue of TAB_ISSUES) {
      expect(describeTabIssue("january.csv", issue, say).text, issue.kind).not.toBe("");
    }
  });

  it("writes a sentence for every kind of Summary issue", () => {
    for (const issue of SUMMARY_ISSUES) {
      expect(describeSummaryIssue("summary.csv", issue, say).text, issue.kind).not.toBe("");
    }
  });

  it("writes a sentence for every kind of ledger issue, notice and verification issue", () => {
    for (const issue of LEDGER_ISSUES) {
      expect(describeMigrationIssue(issue, say).text, issue.kind).not.toBe("");
    }
    for (const notice of NOTICES) {
      expect(describeNotice(notice, say).text, notice.kind).not.toBe("");
    }
    for (const issue of VERIFICATION_ISSUES) {
      expect(describeVerificationIssue(issue, say).text, issue.kind).not.toBe("");
    }
  });
});

describe("what is blocking", () => {
  const say = sayIn("en");

  it("blocks on what would lose or misread a row of the monthly tabs", () => {
    const blockingKinds = TAB_ISSUES.filter(
      (issue) => describeTabIssue("a.csv", issue, say).isBlocking,
    ).map((issue) => issue.kind);

    expect(new Set(blockingKinds)).toEqual(
      new Set([
        "emptyFile",
        "delimiterNotFound",
        "unreadableFile",
        "mappingColumnNotFound",
        "dateFormatNotFound",
        "dateYearMissing",
        "rowUnreadable",
        "typeUnrecognized",
        "typeMissing",
      ]),
    );
  });

  it("only asks to read what concerns the Summary, the notices and the comparison", () => {
    const everything = [
      ...SUMMARY_ISSUES.map((issue) => describeSummaryIssue("s.csv", issue, say)),
      ...NOTICES.map((notice) => describeNotice(notice, say)),
      ...VERIFICATION_ISSUES.map((issue) => describeVerificationIssue(issue, say)),
    ];

    expect(everything.every((issue) => !issue.isBlocking)).toBe(true);
  });

  it("blocks on every issue of the ledger", () => {
    expect(
      LEDGER_ISSUES.every((issue) => describeMigrationIssue(issue, say).isBlocking),
    ).toBe(true);
  });
});

describe("where a problem is", () => {
  const say = sayIn("en");

  it("names the file and the line of a row", () => {
    expect(
      describeTabIssue("january.csv", { kind: "typeMissing", line: 4 }, say).text,
    ).toBe("january.csv, line 4: Row skipped: its type is empty.");
  });

  it("names the line of a row whose label was taken from its category", () => {
    const issue = describeTabIssue(
      "january.csv",
      { kind: "labelFromCategory", line: 3, category: "Food" },
      say,
    );

    expect(issue).toEqual({
      isBlocking: false,
      text: 'january.csv, line 3: The label is empty: the category "Food" is used as the label.',
    });
  });

  it.each([
    [",", "1 234,56"],
    [".", "1,234.56"],
  ] as const)("shows how the amounts are read when the mark is %j", (mark, example) => {
    expect(
      describeTabIssue("a.csv", { kind: "numberFormatAmbiguous", mark }, say).text,
    ).toContain(example);
  });

  it("lists the columns and the lines it ignored, numbering the columns from 1", () => {
    const text = (issue: SheetTabIssue): string =>
      describeTabIssue("a.csv", issue, say).text;

    expect(text({ kind: "columnsIgnored", columns: [5, 6] })).toContain("6, 7");
    expect(
      text({ kind: "rowsIgnored", reason: "beforeHeader", lines: [1, 2] }),
    ).toContain("1, 2");
    expect(text({ kind: "rowsIgnored", reason: "total", lines: [9] })).toContain(
      "9",
    );
  });

  it("names only the file when the problem is about the whole file", () => {
    expect(
      describeTabIssue("january.csv", { kind: "dateYearMissing" }, say).text,
    ).toMatch(/^january\.csv: The dates have no year/);
  });

  it("names the file and the line of a row that the ledger refuses", () => {
    expect(
      describeMigrationIssue(
        { kind: "savingsUnplaced", source: "february.csv", line: 7, amount: 35_000 },
        say,
      ).text,
    ).toBe(
      "february.csv, line 7: €350.00 of this savings row fits in no account of the chain.",
    );
  });

  it("cuts a long list of lines instead of printing all of them", () => {
    const text = describeTabIssue(
      "a.csv",
      {
        kind: "unrecognizedValue",
        role: "type",
        value: "Refund",
        lines: [2, 3, 4, 5, 6, 7, 8],
      },
      say,
    ).text;

    expect(text).toContain("(lines 2, 3, 4, 5, 6, …)");
  });

  it("numbers the columns from 1, as in a spreadsheet", () => {
    const text = describeTabIssue(
      "a.csv",
      { kind: "ambiguousColumn", role: "type", column: 3, alsoMatching: [4] },
      say,
    ).text;

    expect(text).toContain("column 4 is used, not 5");
  });
});

describe("the months left out of the comparison", () => {
  it("names them, in the language of the request", () => {
    expect(
      describeIgnoredMonths(["2026-11", "2026-12"], sayIn("fr"))?.text,
    ).toContain("novembre 2026, décembre 2026");
  });

  it("says nothing when none is left out", () => {
    expect(describeIgnoredMonths([], sayIn("en"))).toBeNull();
  });
});
