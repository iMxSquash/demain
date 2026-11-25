import type { FileContext } from "../../domain/import-assertions";
import { readImportDraft, type RowProblem } from "../../domain/import-draft";
import type { ReviewedRow } from "../../domain/import-review";
import {
  findEnteredPayments,
  type EnteredPaymentMatch,
  type MatchTransaction,
} from "../../domain/planned-matching";
import type { EntryReplacement } from "../../ledger/imports";
import type { EnteredPaymentEntry } from "../../ledger/planned-matching";

export type EnteredMatch = EnteredPaymentMatch<EnteredPaymentEntry>;

/** What the owner chose for a flagged row, by its position: the entry to replace, or null to keep both. */
export type EnteredChoices = ReadonlyMap<number, number | null>;

/**
 * The rows of a file under review that may be an entry marked as paid, read as the import
 * records them (the shown amount follows the type). Duplicates, rows with a problem and savings
 * rows are not imported as expenses or incomes, so they are left out, as are the entries that a
 * file imported earlier in the review already replaced.
 */
export function enteredMatchesOf(
  rows: readonly (ReviewedRow & { problem: RowProblem | null })[],
  { accountId, currency }: FileContext,
  entered: readonly EnteredPaymentEntry[],
  replacedIds: ReadonlySet<number> = new Set(),
): EnteredMatch[] {
  const available = entered.filter((entry) => entry.accountId === accountId && !replacedIds.has(entry.id));
  if (available.length === 0) return [];
  const candidates = rows.flatMap((row, index): MatchTransaction[] => {
    const { type } = row.details;
    if (row.isDuplicate || row.problem !== null || type === "savings") return [];
    const reading = readImportDraft(row.draft, currency);
    if (!reading.ok) return [];
    const { date, label, amount } = reading.row;
    return [{ id: index, accountId, categoryId: row.details.categoryId, date, label, amount, kind: type }];
  });
  return findEnteredPayments(candidates, available);
}

export interface SettledEnteredChoices {
  /** The entry chosen for each flagged row: an id, null to keep both, undefined when none yet. */
  chosen: ReadonlyMap<number, number | null | undefined>;
  replacements: EntryReplacement[];
  /** Rows where the owner must still choose: the file is not imported before. */
  unsettledCount: number;
  /** One entry is chosen for two rows, which the ledger refuses. */
  isEntryChosenTwice: boolean;
}

/** A choice the owner made stands while its entry is still offered; otherwise the proposal does. */
export function settleEnteredChoices(
  matches: readonly EnteredMatch[],
  choices: EnteredChoices,
): SettledEnteredChoices {
  const chosen = new Map(
    matches.map(({ rowId, candidates, proposed }) => {
      const choice = choices.get(rowId);
      const stands = choice === null || candidates.some((entry) => entry.id === choice);
      return [rowId, stands ? choice : proposed?.id] as const;
    }),
  );
  const replacements = [...chosen].flatMap(([index, entryId]) =>
    typeof entryId === "number" ? [{ index, entryId }] : [],
  );
  return {
    chosen,
    replacements,
    unsettledCount: [...chosen.values()].filter((choice) => choice === undefined).length,
    isEntryChosenTwice: new Set(replacements.map(({ entryId }) => entryId)).size < replacements.length,
  };
}
