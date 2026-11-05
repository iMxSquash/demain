import { eq } from "drizzle-orm";

import { validateBalanceAssertionInput } from "../domain/balance-assertion";
import type { SummaryBalance } from "../domain/sheet-summary";
import {
  planSummaryAssertions,
  type SummaryAssertionPlan,
} from "../domain/summary-assertions";
import type { AppDatabase } from "../storage/database";
import { balanceAssertions } from "../storage/schema";
import { getAccount } from "./accounts";
import {
  BalanceAssertionOnArchivedAccountError,
  recordValidAssertion,
  type SavedBalanceAssertion,
} from "./balance-assertions";

export interface SummaryAssertionPreview
  extends Omit<SummaryAssertionPlan, "assertions"> {
  assertions: (SummaryAssertionPlan["assertions"][number] & {
    /** The amount of the assertion this one would replace, or null for a new day. */
    replacedAmount: number | null;
  })[];
}

export interface SummaryAssertionsSaved
  extends Omit<SummaryAssertionPlan, "assertions"> {
  saved: SavedBalanceAssertion[];
}

/** What recording the Summary balances on an account would create, replace and refuse. Writes nothing. */
export function previewSummaryAssertions(
  db: AppDatabase,
  accountId: number,
  balances: readonly SummaryBalance[],
  today: string,
): SummaryAssertionPreview {
  const account = getAccount(db, accountId);
  const { assertions, ...rest } = planSummaryAssertions(balances, account, today);
  const existing = new Map(
    db
      .select({ date: balanceAssertions.date, amount: balanceAssertions.amount })
      .from(balanceAssertions)
      .where(eq(balanceAssertions.accountId, accountId))
      .all()
      .map((assertion) => [assertion.date, assertion.amount]),
  );
  return {
    ...rest,
    assertions: assertions.map((assertion) => ({
      ...assertion,
      replacedAmount: existing.get(assertion.date) ?? null,
    })),
  };
}

/**
 * Records the accepted months of the Summary as balance assertions, in one
 * transaction: all or nothing. A day that already has one is replaced, as for
 * any assertion. The refused months are reported, not recorded; an archived
 * account is refused as a whole.
 */
export function saveSummaryAssertions(
  db: AppDatabase,
  accountId: number,
  balances: readonly SummaryBalance[],
  today: string,
): SummaryAssertionsSaved {
  const account = getAccount(db, accountId);
  if (account.archived) {
    throw new BalanceAssertionOnArchivedAccountError(accountId);
  }
  const { assertions, ...rest } = planSummaryAssertions(balances, account, today);
  // Validated before anything is written, so that one bad amount stops the whole batch.
  const valid = assertions.map((assertion) =>
    validateBalanceAssertionInput(assertion, account),
  );
  const saved = db.transaction((tx) =>
    valid.map((assertion) => recordValidAssertion(tx, assertion)),
  );
  return { ...rest, saved };
}
