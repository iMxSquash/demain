/**
 * Migration of the spreadsheet history. Pure functions: no database, no
 * clock. See DOMAIN, section Migration from the sheet.
 */

import type { MovementType } from "./import-columns";
import type { PaymentMode } from "./transaction";
import {
  routeAlongOverflowChain,
  type OverflowAccount,
  type Placement,
} from "./overflow";

/** A savings line of the sheet: money leaving the checking account for savings. */
export interface SavingsRow {
  /** Name of the file the row comes from: line numbers repeat from one file to the next. */
  source: string;
  /** Line in that file, to point the user at the row. */
  line: number;
  /** YYYY-MM-DD. */
  date: string;
  label: string;
  /** Positive integer in minor units. */
  amount: number;
}

/** A line of a monthly tab once its columns are read. */
export interface SheetRow extends SavingsRow {
  type: MovementType;
  /** Name written in the sheet; null when the line has none. */
  category: string | null;
  paymentMode: PaymentMode | null;
}

export interface SavingsSplit {
  row: SavingsRow;
  placements: Placement[];
  /** Part that fits nowhere along the chain; also reported in `issues`. */
  unplaced: number;
}

/** What the user has to look at: nothing is dropped without one of these. */
export type SavingsIssue =
  | { kind: "savingsAmountInvalid"; source: string; line: number }
  | { kind: "savingsUnplaced"; source: string; line: number; amount: number }
  | { kind: "overflowChainCycle" };

export interface SavingsSplitting {
  splits: SavingsSplit[];
  issues: SavingsIssue[];
}

/**
 * Splits each savings row along the overflow chain that starts at
 * `destinationId`, row after row: a row fills the first account up to its
 * ceiling and the rest goes down the chain, as the owner did by hand.
 * A row that cannot be placed, wholly or in part, is reported.
 */
export function splitSavingsRows(
  rows: readonly SavingsRow[],
  destinationId: number,
  accounts: readonly OverflowAccount[],
): SavingsSplitting {
  // Balances move as rows are placed; the caller's accounts stay untouched.
  const running = accounts.map((account) => ({ ...account }));
  const splits: SavingsSplit[] = [];
  const issues: SavingsIssue[] = [];

  // ISO dates sort as text; the sort is stable, so rows of one day keep the file order.
  const chronological = [...rows].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
  );

  // Every invalid row is reported, even when a loop later stops the placement.
  const valid = chronological.filter((savingsRow) => {
    const isValid =
      Number.isSafeInteger(savingsRow.amount) && savingsRow.amount > 0;
    if (!isValid) {
      issues.push({
        kind: "savingsAmountInvalid",
        source: savingsRow.source,
        line: savingsRow.line,
      });
    }
    return isValid;
  });

  for (const savingsRow of valid) {
    const routing = routeAlongOverflowChain(
      savingsRow.amount,
      destinationId,
      running,
    );
    // The chain does not depend on the balances: one loop spoils every row.
    if (routing.status !== "ok") {
      return {
        splits: [],
        issues: [...issues, { kind: "overflowChainCycle" }],
      };
    }
    for (const placement of routing.placements) {
      const account = running.find((a) => a.id === placement.accountId);
      if (account !== undefined) account.balance += placement.amount;
    }
    splits.push({
      row: savingsRow,
      placements: routing.placements,
      unplaced: routing.unplaced,
    });
    if (routing.unplaced > 0) {
      issues.push({
        kind: "savingsUnplaced",
        source: savingsRow.source,
        line: savingsRow.line,
        amount: routing.unplaced,
      });
    }
  }
  return { splits, issues };
}
