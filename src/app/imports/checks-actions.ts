"use server";

import { revalidatePath } from "next/cache";
import { getLocale, getTranslations } from "next-intl/server";
import { z } from "zod";

import { parseRealBalance, RealBalanceError } from "../../domain/batch-balance";
import { messageRef, type FeedbackKey } from "../../domain/message";
import { formatAmount } from "../../domain/money";
import { formatCalendarDate } from "../../i18n/dates";
import {
  batchBalanceGap,
  getBatchBalanceCheck,
  ImportBatchWithoutMovementError,
  hasCategorizedRow,
  listRuleProposals,
  recordBatchBalanceAssertion,
  saveRuleProposals,
} from "../../ledger/import-checks";
import { ImportBatchNotFoundError } from "../../ledger/import-batch-lookup";
import {
  ImportBatchChangedError,
  ImportBatchUnverifiableError,
  undoImportBatch,
} from "../../ledger/import-undo";
import { TransactionValidationError } from "../../domain/transaction";
import { BalanceAssertionOnArchivedAccountError } from "../../ledger/balance-assertions";
import { withDatabase } from "../../storage/with-database";
import { requireSession } from "../auth/session";
import { revalidateLedger } from "../revalidate-ledger";
import { getTranslator } from "../translator";
import type {
  BalanceCheckState,
  RuleProposalsSaveState,
  RuleProposalsState,
  UndoImportState,
} from "./import-form-data";

const MAX_BALANCE_TEXT_LENGTH = 100;
const MAX_SELECTED_PROPOSALS = 1000;
const MAX_PROPOSAL_KEY_LENGTH = 1000;

type Translator = Awaited<ReturnType<typeof getTranslations>>;

/** The translators, the locale and the error builders every action of this file starts from. */
async function loadActionContext(
  namespace:
    | "imports.staged.balanceCheck"
    | "imports.staged.ruleProposals"
    | "imports.staged.undo",
) {
  const [t, translate, locale] = await Promise.all([
    getTranslations(namespace),
    getTranslator(),
    getLocale(),
  ]);
  const failText = (message: string) => ({ status: "error", message }) as const;
  const fail = (key: FeedbackKey) => failText(translate(messageRef(key)));
  return { t, translate, locale, fail, failText };
}

/** The gap between the two balances, told in a sentence that names the date. */
function describeGap(
  t: Translator,
  gap: number,
  values: { date: string; amount: string },
): string {
  if (gap === 0) return t("gapMatch", values);
  return t(gap > 0 ? "gapMore" : "gapLess", values);
}

const requestSchema = z.object({
  batchId: z.number().int().min(1),
  realBalanceText: z.string().max(MAX_BALANCE_TEXT_LENGTH),
});

/**
 * Tells how far the balance Demain computes at the end of a recorded file is
 * from the real balance the user read in the bank. Nothing is written.
 */
export async function checkBatchBalanceAction(
  batchId: number,
  realBalanceText: string,
): Promise<BalanceCheckState> {
  await requireSession();
  const { t, translate, locale, fail } = await loadActionContext(
    "imports.staged.balanceCheck",
  );

  const parsed = requestSchema.safeParse({ batchId, realBalanceText });
  if (!parsed.success) return fail("balanceCheckFailed");

  try {
    const check = withDatabase((db) => getBatchBalanceCheck(db, parsed.data.batchId));
    const realBalance = parseRealBalance(parsed.data.realBalanceText, check.currency);
    const gap = batchBalanceGap(check, realBalance);
    const values = {
      date: formatCalendarDate(check.endDate, locale),
      amount: formatAmount(Math.abs(gap), check.currency, locale),
    };
    return { status: "gap", message: describeGap(t, gap, values) };
  } catch (error) {
    if (error instanceof RealBalanceError) {
      return { status: "error", message: translate(error.ref) };
    }
    if (
      error instanceof ImportBatchNotFoundError ||
      error instanceof ImportBatchWithoutMovementError
    ) {
      return fail("importBatchGone");
    }
    // Unexpected failures are logged with their detail, the user sees a generic message.
    console.error("Balance check failed", error);
    return fail("balanceCheckFailed");
  }
}

/**
 * Records the real balance typed by the user as a balance assertion on the
 * account of a recorded file, dated on the end of the file. Nothing is
 * written when the text cannot be read exactly.
 */
export async function recordBatchBalanceAssertionAction(
  batchId: number,
  realBalanceText: string,
): Promise<BalanceCheckState> {
  await requireSession();
  const { t, translate, locale, fail } = await loadActionContext(
    "imports.staged.balanceCheck",
  );

  const parsed = requestSchema.safeParse({ batchId, realBalanceText });
  if (!parsed.success) return fail("balanceAssertionNotSaved");

  try {
    const { check, realBalance } = withDatabase((db) => {
      const check = getBatchBalanceCheck(db, parsed.data.batchId);
      const realBalance = parseRealBalance(parsed.data.realBalanceText, check.currency);
      recordBatchBalanceAssertion(db, check.batchId, realBalance);
      return { check, realBalance };
    });
    revalidatePath(`/accounts/${check.accountId}/balances`);
    const gap = batchBalanceGap(check, realBalance);
    const values = {
      date: formatCalendarDate(check.endDate, locale),
      amount: formatAmount(Math.abs(gap), check.currency, locale),
    };
    return {
      status: "recorded",
      message: `${t("balanceAssertionRecorded", values)} ${describeGap(t, gap, values)}`,
    };
  } catch (error) {
    if (error instanceof RealBalanceError) {
      return { status: "error", message: translate(error.ref) };
    }
    if (error instanceof BalanceAssertionOnArchivedAccountError) {
      return fail("balanceAssertionOnArchivedAccount");
    }
    if (
      error instanceof ImportBatchNotFoundError ||
      error instanceof ImportBatchWithoutMovementError
    ) {
      return fail("importBatchGone");
    }
    // Unexpected failures are logged with their detail, the user sees a generic message.
    console.error("Balance assertion from an import failed", error);
    return fail("balanceAssertionNotSaved");
  }
}

const batchIdSchema = z.number().int().min(1);

const proposalSelectionSchema = z
  .array(z.string().max(MAX_PROPOSAL_KEY_LENGTH))
  .max(MAX_SELECTED_PROPOSALS);

/** The rules the categorized rows of a recorded file suggest. Nothing is written. */
export async function listRuleProposalsAction(
  batchId: number,
): Promise<RuleProposalsState> {
  await requireSession();
  const { fail } = await loadActionContext("imports.staged.ruleProposals");

  const parsed = batchIdSchema.safeParse(batchId);
  if (!parsed.success) return fail("ruleProposalsFailed");

  try {
    const { proposals, hasCategorizedRow: isAnyRowCategorized } = withDatabase((db) => ({
      proposals: listRuleProposals(db, parsed.data),
      hasCategorizedRow: hasCategorizedRow(db, parsed.data),
    }));
    return {
      status: "ready",
      hasCategorizedRow: isAnyRowCategorized,
      proposals: proposals.map(({ key, label, categoryName, shadowingCategoryName }) => ({
        key,
        label,
        categoryName,
        shadowingCategoryName,
      })),
    };
  } catch (error) {
    if (error instanceof ImportBatchNotFoundError) return fail("importBatchGone");
    // Unexpected failures are logged with their detail, the user sees a generic message.
    console.error("Rule proposals failed", error);
    return fail("ruleProposalsFailed");
  }
}

/**
 * Creates the rules the user selected among the proposals of a recorded file.
 * The server derives the proposals again: a key it does not propose creates
 * nothing.
 */
export async function saveRuleProposalsAction(
  batchId: number,
  selectedKeys: string[],
): Promise<RuleProposalsSaveState> {
  await requireSession();
  const { t, fail, failText } = await loadActionContext("imports.staged.ruleProposals");

  const parsed = z
    .object({ batchId: batchIdSchema, selectedKeys: proposalSelectionSchema })
    .safeParse({ batchId, selectedKeys });
  if (!parsed.success) return fail("ruleProposalsNotSaved");
  if (parsed.data.selectedKeys.length === 0) return failText(t("noneSelected"));

  try {
    const { created } = withDatabase((db) =>
      saveRuleProposals(db, parsed.data.batchId, parsed.data.selectedKeys),
    );
    if (created === 0) return failText(t("nothingCreated"));
    revalidatePath("/rules");
    return { status: "saved", message: t("saved", { count: created }) };
  } catch (error) {
    if (error instanceof ImportBatchNotFoundError) {
      return fail("importBatchGone");
    }
    // Unexpected failures are logged with their detail, the user sees a generic message.
    console.error("Saving rule proposals failed", error);
    return fail("ruleProposalsNotSaved");
  }
}

/**
 * Removes a recorded file as a whole. The ledger refuses, and removes nothing,
 * when the file changed since it was recorded, cannot be verified, or touches
 * an archived account.
 */
export async function undoImportBatchAction(
  batchId: number,
): Promise<UndoImportState> {
  await requireSession();
  const { t, fail } = await loadActionContext("imports.staged.undo");

  const parsed = batchIdSchema.safeParse(batchId);
  if (!parsed.success) return fail("importUndoFailed");

  try {
    const removed = withDatabase((db) => undoImportBatch(db, parsed.data));
    revalidateLedger();
    return { status: "undone", message: t("done", { count: removed }) };
  } catch (error) {
    if (error instanceof ImportBatchNotFoundError) return fail("importBatchGone");
    if (error instanceof ImportBatchChangedError) return fail("importUndoChanged");
    if (error instanceof ImportBatchUnverifiableError) return fail("importUndoUnverifiable");
    if (error instanceof TransactionValidationError) {
      return fail("importUndoArchivedAccount");
    }
    // Unexpected failures are logged with their detail, the user sees a generic message.
    console.error("Undoing an import failed", error);
    return fail("importUndoFailed");
  }
}
