/**
 * Month-by-month comparison between what Demain computes from the imported
 * history and the figures of the sheet's Summary tab. Pure functions: no
 * database, no clock. See DOMAIN, section Migration from the sheet.
 */

import { isCalendarDate } from "./account";
import type { SavingsSplit } from "./sheet-import";
import {
  computeMonthlySynthesis,
  monthOf,
  type Month,
  type SynthesisAccount,
  type SynthesisTransaction,
} from "./synthesis";

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
 * something that could not be compared at all. The migration is accepted when
 * both lists are empty or every entry is explained.
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

/** The history the migration would create, as the synthesis needs to read it. */
export interface MigratedLedger {
  checkingId: number;
  /** The accounts that hold the savings: the Summary adds their balances up. */
  savingsAccountIds: readonly number[];
  /** The checking account and the savings chain, with the opening balances to be set. */
  accounts: readonly SynthesisAccount[];
  referenceCurrency: string;
  movements: readonly {
    date: string;
    /** Signed integer in minor units. */
    amount: number;
    kind: "expense" | "income";
  }[];
  splits: readonly SavingsSplit[];
}

function toSynthesisTransactions(ledger: MigratedLedger): SynthesisTransaction[] {
  const transactions: SynthesisTransaction[] = [];
  let nextId = 1;
  for (const movement of ledger.movements) {
    if (!isCalendarDate(movement.date)) continue;
    transactions.push({
      id: nextId++,
      accountId: ledger.checkingId,
      date: movement.date,
      amount: movement.amount,
      kind: movement.kind,
      transferCounterpartId: null,
    });
  }
  for (const { row, placements } of ledger.splits) {
    if (!isCalendarDate(row.date)) continue;
    for (const placement of placements) {
      const outgoingId = nextId++;
      const incomingId = nextId++;
      transactions.push(
        {
          id: outgoingId,
          accountId: ledger.checkingId,
          date: row.date,
          amount: -placement.amount,
          kind: "transfer",
          transferCounterpartId: incomingId,
        },
        {
          id: incomingId,
          accountId: placement.accountId,
          date: row.date,
          amount: placement.amount,
          kind: "transfer",
          transferCounterpartId: outgoingId,
        },
      );
    }
  }
  return transactions;
}

/**
 * The figures of the Summary, recomputed from the history that the migration
 * would create. The months before the first movement hold only the opening
 * balances and have no line in the sheet: they are left out.
 */
export function computeMigratedMonths(ledger: MigratedLedger): ComputedMonth[] {
  const transactions = toSynthesisTransactions(ledger);
  if (transactions.length === 0) return [];

  // "YYYY-MM" strings sort chronologically.
  const months = transactions.map((transaction) => monthOf(transaction.date));
  const firstMonth = months.reduce((a, b) => (a < b ? a : b));
  const lastMonth = months.reduce((a, b) => (a > b ? a : b));
  const savingsIds = new Set(ledger.savingsAccountIds);

  return computeMonthlySynthesis({
    accounts: ledger.accounts,
    transactions,
    referenceCurrency: ledger.referenceCurrency,
    throughMonth: lastMonth,
  })
    .filter((synthesis) => synthesis.month >= firstMonth)
    .map((synthesis) => ({
      month: synthesis.month,
      net: synthesis.net,
      savings: synthesis.savings,
      cumulativeSavings: synthesis.cumulativeSavings,
      cumulativeAccount: synthesis.cumulativeAccount,
      savingsBalance: synthesis.balances
        .filter((balance) => savingsIds.has(balance.accountId))
        .reduce((sum, balance) => sum + balance.balance, 0),
    }));
}
