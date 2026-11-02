/**
 * Migration of the spreadsheet history. Pure functions: no database, no
 * clock. See DOMAIN, section Migration from the sheet.
 */

import type { MovementType } from "./import-columns";
import type { PaymentMode } from "./transaction";
import { planSavingsTransfers, type SavingsMovement } from "./import-savings";
import type { OverflowAccount, Placement } from "./overflow";

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
 * A row that cannot be placed, wholly or in part, is reported. The sheet only
 * knows deposits: a row that is not a positive amount is invalid, never a
 * withdrawal.
 */
export function splitSavingsRows(
  rows: readonly SavingsRow[],
  destinationId: number,
  accounts: readonly OverflowAccount[],
): SavingsSplitting {
  // A zero amount is how the planner is told that a row is invalid.
  const movements = rows.map(
    (row, index): SavingsMovement => ({
      index,
      date: row.date,
      amount: Number.isSafeInteger(row.amount) && row.amount > 0 ? -row.amount : 0,
      savingsAccountId: destinationId,
    }),
  );
  const plan = planSavingsTransfers(movements, accounts);

  const rowAt = (index: number): SavingsRow => {
    const row = rows[index];
    if (row === undefined) throw new Error(`Unknown savings row ${index}`);
    return row;
  };
  return {
    splits: plan.transfers.flatMap((transfer) =>
      transfer.kind === "deposit"
        ? [
            {
              row: rowAt(transfer.index),
              placements: transfer.placements,
              unplaced: transfer.unplaced,
            },
          ]
        : [],
    ),
    issues: plan.issues.map((issue): SavingsIssue => {
      if (issue.kind === "overflowChainCycle") return issue;
      const { source, line } = rowAt(issue.index);
      return issue.kind === "savingsUnplaced"
        ? { kind: "savingsUnplaced", source, line, amount: issue.amount }
        : { kind: "savingsAmountInvalid", source, line };
    }),
  };
}
