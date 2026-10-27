import { formatAmount } from "../../domain/money";
import type { SheetRow } from "../../domain/sheet-import";
import type { SummaryReading } from "../../domain/sheet-summary";
import type { SheetTabReading } from "../../domain/sheet-tab";
import { formatCalendarDate, formatMonth } from "../../i18n/dates";
import type { SheetMigrationPreview } from "../../ledger/sheet-migration";
import {
  describeIgnoredMonths,
  describeMigrationIssue,
  describeNotice,
  describeSummaryIssue,
  describeTabIssue,
  describeVerificationIssue,
  figureLabel,
  type ReportedIssue,
  type Say,
} from "./describe-issues";
import type {
  DifferenceRow,
  MigrationFormState,
  PlannedSplit,
} from "./migration-form-data";

/** Lines of each list shown at once: a file with hundreds of bad rows must not bury the page. */
const LISTED_ISSUES = 100;

export interface PreviewReading {
  tabs: readonly SheetTabReading[];
  summary: { source: string; reading: SummaryReading } | null;
  /** Summary months outside the imported period, named in the report. */
  ignoredSummaryMonths: readonly string[];
  rows: readonly SheetRow[];
  preview: SheetMigrationPreview;
}

function reportedIssues(reading: PreviewReading, say: Say): ReportedIssue[] {
  const { preview } = reading;
  const ignored = describeIgnoredMonths(reading.ignoredSummaryMonths, say);
  return [
    ...reading.tabs.flatMap((tab) =>
      tab.issues.map((issue) => describeTabIssue(tab.source, issue, say)),
    ),
    ...(reading.summary?.reading.issues ?? []).map((issue) =>
      describeSummaryIssue(reading.summary?.source ?? "", issue, say),
    ),
    // A migration of nothing is no migration: it must not look like a success.
    ...(reading.rows.length === 0
      ? [{ isBlocking: true, text: say.t("messages.noRows") }]
      : []),
    ...preview.issues.map((issue) => describeMigrationIssue(issue, say)),
    ...preview.notices.map((notice) => describeNotice(notice, say)),
    ...(preview.verification?.issues ?? []).map((issue) =>
      describeVerificationIssue(issue, say),
    ),
    ...(ignored === null ? [] : [ignored]),
  ];
}

function cut(texts: readonly string[], say: Say): string[] {
  if (texts.length <= LISTED_ISSUES) return [...texts];
  return [
    ...texts.slice(0, LISTED_ISSUES),
    say.t("moreIssues", { count: texts.length - LISTED_ISSUES }),
  ];
}

function describePlan(reading: PreviewReading, say: Say): string[] {
  const { preview } = reading;
  const transfers = preview.splits.reduce(
    (count, split) => count + split.placements.length,
    0,
  );
  return [
    say.t("planTransactions", {
      count: reading.rows.filter((row) => row.type !== "savings").length,
    }),
    say.t("planTransfers", { count: transfers }),
    say.t("planCategories", { count: preview.categoriesToCreate.length }),
    say.t("planRules", { count: preview.rulesToCreate.length }),
    say.t("planAssertions", { count: preview.assertionsToCreate.length }),
  ];
}

function describeSplits(preview: SheetMigrationPreview, say: Say): PlannedSplit[] {
  const money = (amount: number) => formatAmount(amount, say.currency, say.locale);
  return preview.splits.map(({ row, placements }) => ({
    location: say.t("location", { source: row.source, line: row.line }),
    date: formatCalendarDate(row.date, say.locale),
    amount: money(row.amount),
    parts: placements
      .map((part) => `${say.accountName(part.accountId)}: ${money(part.amount)}`)
      .join("; "),
  }));
}

function describeDifferences(
  preview: SheetMigrationPreview,
  say: Say,
): DifferenceRow[] {
  const money = (amount: number) => formatAmount(amount, say.currency, say.locale);
  return (preview.verification?.differences ?? []).map((difference) => ({
    month: formatMonth(difference.month, say.locale),
    figure: figureLabel(difference.figure, say),
    sheet: money(difference.sheet),
    demain: money(difference.demain),
    difference: money(Math.abs(difference.demain - difference.sheet)),
  }));
}

/**
 * What the screen shows once everything has been read: the problems, the
 * points to check, what would be recorded and how it compares with the Summary.
 */
export function buildPreviewState(
  reading: PreviewReading,
  say: Say,
): MigrationFormState {
  const reported = reportedIssues(reading, say);
  const blocking = reported.filter((issue) => issue.isBlocking);
  const review = reported.filter((issue) => !issue.isBlocking);
  const differences = describeDifferences(reading.preview, say);
  const canCommit = blocking.length === 0;

  return {
    status: "preview",
    message: say.t(canCommit ? "messages.previewReady" : "messages.blocked"),
    blocking: cut(blocking.map((issue) => issue.text), say),
    review: cut(review.map((issue) => issue.text), say),
    plan: describePlan(reading, say),
    splits: describeSplits(reading.preview, say),
    differences,
    isMatching: reading.preview.verification?.isMatching ?? false,
    canCommit,
    needsConfirmation: review.length > 0 || differences.length > 0,
  };
}
