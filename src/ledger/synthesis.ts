import {
  computeMonthlySynthesis,
  type Month,
  type MonthlySynthesis,
} from "../domain/synthesis";
import type { AppDatabase } from "../storage/database";
import { listAccounts } from "./accounts";
import { listTransactions } from "./transactions";

/**
 * The monthly synthesis of everything stored. Archived accounts are included:
 * their history stays in the figures of the months it covers (DOMAIN,
 * archiving an account). The last month is given by the caller, since the
 * domain has no clock.
 */
export function getMonthlySynthesis(
  db: AppDatabase,
  options: { referenceCurrency: string; throughMonth: Month },
): MonthlySynthesis[] {
  return computeMonthlySynthesis({
    accounts: listAccounts(db, { includeArchived: true }),
    transactions: listTransactions(db),
    ...options,
  });
}
