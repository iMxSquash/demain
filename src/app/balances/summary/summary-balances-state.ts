import { formatAmount } from "../../../domain/money";
import type {
  SummaryBalance,
  SummaryBalancesIssue,
} from "../../../domain/sheet-summary";
import type { LedgerComparison } from "../../../domain/sheet-verification";
import { lastDayOfMonth } from "../../../domain/summary-assertions";
import { formatCalendarDate, formatMonth } from "../../../i18n/dates";
import type { SummaryAssertionPreview } from "../../../ledger/summary-assertions";
import {
  describeSummaryIssue,
  describeVerificationIssue,
  figureLabel,
  type Say,
} from "./describe-issues";
import type { SummaryField } from "./summary-balances-form-data";

export interface SummaryBalanceRow {
  month: string;
  date: string;
  balance: string;
  /** What happens, or happened, to the month: always a sentence. */
  status: string;
}

export interface SummaryDifferenceRow {
  month: string;
  figure: string;
  sheet: string;
  demain: string;
  /** Demain minus the Summary, signed. */
  difference: string;
}

/** What the screen shows, already translated and formatted: it crosses to the browser as is. */
export interface SummaryBalancesState {
  status: "error" | "preview" | "done";
  message: string;
  /** The control an error is about; null when the error concerns none. */
  errorField: SummaryField | null;
  /** Translated points to read: file problems, months left out of the comparison. */
  notes: string[];
  rows: SummaryBalanceRow[];
  differences: SummaryDifferenceRow[];
  /** At least one month was compared and every one matches to the cent. */
  isMatching: boolean;
  /** The comparison has something to say: matching months, differences or months it could not compare. */
  hasComparison: boolean;
  canCommit: boolean;
}

export interface SummaryBalancesReading {
  source: string;
  issues: readonly SummaryBalancesIssue[];
  balances: readonly SummaryBalance[];
  preview: SummaryAssertionPreview;
  comparison: LedgerComparison;
}

export interface SummaryBalancesContext {
  /** Speaks the language of the Summary file's own issues and of the comparison. */
  say: Say;
  /** "done" once the balances are recorded: the outcomes are then in the past tense. */
  phase: "preview" | "done";
}

function describeRows(
  reading: SummaryBalancesReading,
  { say, phase }: SummaryBalancesContext,
): SummaryBalanceRow[] {
  const { t } = say;
  const money = (amount: number) => formatAmount(amount, say.currency, say.locale);
  const planned = new Map(
    reading.preview.assertions.map((assertion) => [assertion.date, assertion]),
  );
  const refused = new Map(
    reading.preview.refused.map(({ month, reason }) => [month, reason]),
  );
  const isDone = phase === "done";

  return [...reading.balances]
    // "YYYY-MM" strings sort chronologically.
    .sort((a, b) => a.month.localeCompare(b.month))
    .map(({ month, amount }) => {
      const date = lastDayOfMonth(month);
      const assertion = planned.get(date);
      const reason = refused.get(month);
      let status: string;
      if (assertion !== undefined) {
        status =
          assertion.replacedAmount === null
            ? t(isDone ? "status.created" : "status.willCreate")
            : t(isDone ? "status.replaced" : "status.willReplace", {
                previous: money(assertion.replacedAmount),
              });
      } else if (reason !== undefined) {
        status = t(`status.refused.${reason}`);
      } else {
        status = t("status.noBalance");
      }
      return {
        month: formatMonth(month, say.locale),
        date: formatCalendarDate(date, say.locale),
        balance: amount === null ? t("noBalance") : money(amount),
        status,
      };
    });
}

function describeNotes(
  reading: SummaryBalancesReading,
  { say }: SummaryBalancesContext,
): string[] {
  const { t } = say;
  const month = (value: string) => formatMonth(value, say.locale);
  const { futureMonths } = reading.comparison;
  return [
    ...reading.issues.map((issue) =>
      issue.kind === "monthDuplicated"
        ? t("issues.monthDuplicated", { month: month(issue.month) })
        : describeSummaryIssue(reading.source, issue, say),
    ),
    ...reading.comparison.issues.map((issue) =>
      describeVerificationIssue(issue, say),
    ),
    ...(futureMonths.length === 0
      ? []
      : [t("issues.futureMonths", { months: futureMonths.map(month).join(", ") })]),
  ];
}

/** A negative amount already carries its sign: a positive one gets it too. */
function signed(amount: number, say: Say): string {
  const text = formatAmount(amount, say.currency, say.locale);
  return amount > 0 ? `+${text}` : text;
}

function describeDifferences(
  comparison: LedgerComparison,
  say: Say,
): SummaryDifferenceRow[] {
  const money = (amount: number) => formatAmount(amount, say.currency, say.locale);
  return comparison.differences.map((difference) => ({
    month: formatMonth(difference.month, say.locale),
    figure: figureLabel(difference.figure, say),
    sheet: money(difference.sheet),
    demain: money(difference.demain),
    difference: signed(difference.demain - difference.sheet, say),
  }));
}

function headline(
  { say: { t }, phase }: SummaryBalancesContext,
  { assertions, refused }: SummaryAssertionPreview,
): string {
  if (phase === "done") return t("messages.done", { count: assertions.length });
  if (assertions.length === 0) return t("messages.nothingToRecord");
  const replaced = assertions.filter((a) => a.replacedAmount !== null).length;
  return t("messages.previewReady", {
    created: assertions.length - replaced,
    replaced,
    refused: refused.length,
  });
}

/**
 * What the screen shows once the Summary has been read: the points to read,
 * what each month becomes as a balance check, and the comparison with the
 * history stored in Demain.
 */
export function buildSummaryBalancesState(
  reading: SummaryBalancesReading,
  context: SummaryBalancesContext,
): SummaryBalancesState {
  const { comparison, preview } = reading;
  return {
    status: context.phase,
    message: headline(context, preview),
    errorField: null,
    notes: describeNotes(reading, context),
    rows: describeRows(reading, context),
    differences: describeDifferences(comparison, context.say),
    isMatching: comparison.isMatching,
    hasComparison:
      comparison.isMatching ||
      comparison.differences.length > 0 ||
      comparison.issues.length > 0,
    canCommit: preview.assertions.length > 0 && context.phase === "preview",
  };
}
