import {
  compareLedgerWithSummary,
  type LedgerComparison,
  type SheetMonth,
} from "../domain/sheet-verification";
import type { Month } from "../domain/synthesis";
import type { AppDatabase } from "../storage/database";
import { listAccounts } from "./accounts";
import { getMonthlySynthesis } from "./synthesis";

/**
 * Compares the Summary with the history stored in Demain, month by month.
 * Archived accounts count: their history stays in the months it covers.
 * Writes nothing.
 */
export function compareStoredHistoryWithSummary(
  db: AppDatabase,
  sheet: readonly SheetMonth[],
  options: { referenceCurrency: string; lastCompleteMonth: Month },
): LedgerComparison {
  const savingsAccountIds = listAccounts(db, { includeArchived: true })
    .filter((account) => account.kind === "savings")
    .map((account) => account.id);
  const synthesis = getMonthlySynthesis(db, {
    referenceCurrency: options.referenceCurrency,
    throughMonth: options.lastCompleteMonth,
  });
  return compareLedgerWithSummary(
    synthesis,
    savingsAccountIds,
    sheet,
    options.lastCompleteMonth,
  );
}
