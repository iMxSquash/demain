/**
 * Month-by-month comparison between what Demain computes from the stored
 * history and the figures of the sheet's Summary tab. Pure functions: no
 * database, no clock.
 */

import type { Month, MonthlySynthesis } from "./synthesis";

export const VERIFIED_FIGURES = [
  "net",
  "savings",
  "cumulativeSavings",
  "cumulativeAccount",
  "savingsBalance",
] as const;

export type VerifiedFigure = (typeof VERIFIED_FIGURES)[number];

/** What Demain computes for a month, in minor units. */
export type ComputedMonth = { month: Month } & Record<VerifiedFigure, number>;

/** What the Summary tab shows for a month; null where its cell is empty. */
export type SheetMonth = { month: Month } & Record<
  VerifiedFigure,
  number | null
>;

export interface FigureDifference {
  month: Month;
  figure: VerifiedFigure;
  sheet: number;
  demain: number;
}

/** What stops a month from being compared: reported, never skipped silently. */
export type VerificationIssue =
  | { kind: "monthMissingInSheet"; month: Month }
  | { kind: "monthMissingInDemain"; month: Month }
  /** The first row of the month is the one compared. */
  | { kind: "duplicateSheetMonth"; month: Month }
  | { kind: "figureMissingInSheet"; month: Month; figure: VerifiedFigure };

export interface SummaryVerification {
  differences: FigureDifference[];
  issues: VerificationIssue[];
  /** Every month matches to the cent and nothing was left out. */
  isMatching: boolean;
}

/**
 * Compares the figures of each month, in date order. A difference needs the
 * user's explanation (a row mistyped in the sheet, for example); an issue is
 * something that could not be compared at all.
 */
export function verifyAgainstSummary(
  computed: readonly ComputedMonth[],
  sheet: readonly SheetMonth[],
): SummaryVerification {
  const computedByMonth = new Map(
    computed.map((entry) => [entry.month, entry]),
  );
  const sheetByMonth = new Map<Month, SheetMonth>();
  const duplicates = new Set<Month>();
  for (const entry of sheet) {
    if (sheetByMonth.has(entry.month)) duplicates.add(entry.month);
    else sheetByMonth.set(entry.month, entry);
  }

  const differences: FigureDifference[] = [];
  const issues: VerificationIssue[] = [];
  // "YYYY-MM" strings sort chronologically.
  const months = [
    ...new Set([...computedByMonth.keys(), ...sheetByMonth.keys()]),
  ].sort();

  for (const month of months) {
    if (duplicates.has(month))
      issues.push({ kind: "duplicateSheetMonth", month });
    const demain = computedByMonth.get(month);
    const fromSheet = sheetByMonth.get(month);
    if (demain === undefined) {
      issues.push({ kind: "monthMissingInDemain", month });
      continue;
    }
    if (fromSheet === undefined) {
      issues.push({ kind: "monthMissingInSheet", month });
      continue;
    }
    for (const figure of VERIFIED_FIGURES) {
      const sheetValue = fromSheet[figure];
      if (sheetValue === null) {
        issues.push({ kind: "figureMissingInSheet", month, figure });
      } else if (sheetValue !== demain[figure]) {
        differences.push({
          month,
          figure,
          sheet: sheetValue,
          demain: demain[figure],
        });
      }
    }
  }
  return {
    differences,
    issues,
    isMatching: differences.length === 0 && issues.length === 0,
  };
}

function toComputedMonth(
  synthesis: MonthlySynthesis,
  savingsIds: ReadonlySet<number>,
): ComputedMonth {
  return {
    month: synthesis.month,
    net: synthesis.net,
    savings: synthesis.savings,
    cumulativeSavings: synthesis.cumulativeSavings,
    cumulativeAccount: synthesis.cumulativeAccount,
    savingsBalance: synthesis.balances
      .filter((balance) => savingsIds.has(balance.accountId))
      .reduce((sum, balance) => sum + balance.balance, 0),
  };
}

export interface LedgerComparison extends SummaryVerification {
  /** Summary months after the last complete month: not compared, and named. */
  futureMonths: Month[];
}

/**
 * Compares the Summary with the history already stored. Only the months from
 * the first to the last Summary month that is over are compared: the months
 * still to come are named, not compared, and the ledger months outside that
 * span are not the Summary's business.
 */
export function compareLedgerWithSummary(
  synthesis: readonly MonthlySynthesis[],
  savingsAccountIds: readonly number[],
  sheet: readonly SheetMonth[],
  lastCompleteMonth: Month,
): LedgerComparison {
  // "YYYY-MM" strings sort chronologically.
  const past = sheet.filter((entry) => entry.month <= lastCompleteMonth);
  const futureMonths = sheet
    .filter((entry) => entry.month > lastCompleteMonth)
    .map((entry) => entry.month);
  const months = past.map((entry) => entry.month).sort();
  const first = months[0];
  const last = months[months.length - 1];
  if (first === undefined || last === undefined) {
    return { differences: [], issues: [], isMatching: false, futureMonths };
  }
  const savingsIds = new Set(savingsAccountIds);
  const computed = synthesis
    .filter((entry) => entry.month >= first && entry.month <= last)
    .map((entry) => toComputedMonth(entry, savingsIds));
  return { ...verifyAgainstSummary(computed, past), futureMonths };
}
