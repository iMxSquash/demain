"use server";

import { getTimeZone, getTranslations } from "next-intl/server";
import { z } from "zod";

import { messageRef, type FeedbackKey } from "../../domain/message";
import { todayIn } from "../../i18n/dates";
import { getImportBatch, ImportBatchNotFoundError } from "../../ledger/import-batch-lookup";
import {
  confirmMatch,
  listBatchMatches,
  PlannedLinkError,
  undoMatch,
} from "../../ledger/planned-matching";
import { withDatabase } from "../../storage/with-database";
import { requireSession } from "../auth/session";
import { refreshData } from "../data-cache";
import { getTranslator } from "../translator";
import type { BatchMatchesState, MatchActionState } from "./import-form-data";

const id = z.number().int().min(1);

// Strict: the browser is not trusted, and the server derives the proposals again anyway.
const pairSchema = z.strictObject({
  transactionId: id,
  plannedItemId: id,
  nominalDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/** The translators and the error builder every action of this file starts from. */
async function loadActionContext() {
  const [t, translate, timeZone] = await Promise.all([
    getTranslations("imports.staged.plannedMatches"),
    getTranslator(),
    getTimeZone(),
  ]);
  const fail = (key: FeedbackKey) =>
    ({ status: "error", message: translate(messageRef(key)) }) as const;
  const failFrom = (error: unknown, fallback: FeedbackKey, context: string) => {
    if (error instanceof PlannedLinkError) {
      return { status: "error", message: translate(error.ref) } as const;
    }
    if (error instanceof ImportBatchNotFoundError) return fail("importBatchGone");
    // Unexpected failures are logged with their detail, the user sees a generic message.
    console.error(context, error);
    return fail(fallback);
  };
  return { t, today: todayIn(timeZone, new Date()), fail, failFrom };
}

/** What the matching did on a recorded file, and the pairs it leaves to the owner. Read only. */
export async function listBatchMatchesAction(batchId: number): Promise<BatchMatchesState> {
  await requireSession();
  const { today, fail, failFrom } = await loadActionContext();

  const parsed = id.safeParse(batchId);
  if (!parsed.success) return fail("plannedMatchesFailed");

  try {
    const { matched, groups } = withDatabase((db) => listBatchMatches(db, parsed.data, today));
    return {
      status: "ready",
      matched: matched.map(
        ({ transactionId, label, date, amount, plannedItemName, nominalDate }) => ({
          transactionId,
          label,
          date,
          amount,
          plannedItemName,
          nominalDate,
        }),
      ),
      groups,
    };
  } catch (error) {
    return failFrom(error, "plannedMatchesFailed", "Listing the planned matches failed");
  }
}

/**
 * Links one pair the owner chose. The ledger derives the proposals again: a pair it does not
 * propose (any more) links nothing.
 */
export async function confirmMatchAction(
  batchId: number,
  pair: { transactionId: number; plannedItemId: number; nominalDate: string },
): Promise<MatchActionState> {
  await requireSession();
  const { t, today, fail, failFrom } = await loadActionContext();

  const parsed = z.strictObject({ batchId: id, pair: pairSchema }).safeParse({ batchId, pair });
  if (!parsed.success) return fail("plannedMatchConfirmFailed");

  try {
    withDatabase((db) => confirmMatch(db, parsed.data.batchId, parsed.data.pair, today));
    refreshData();
    return { status: "done", message: t("confirmed") };
  } catch (error) {
    return failFrom(error, "plannedMatchConfirmFailed", "Confirming a planned match failed");
  }
}

/** Unlinks a transaction of a recorded file from the occurrence it was matched to. */
export async function undoMatchAction(
  batchId: number,
  transactionId: number,
): Promise<MatchActionState> {
  await requireSession();
  const { t, fail, failFrom } = await loadActionContext();

  const parsed = z.strictObject({ batchId: id, transactionId: id }).safeParse({
    batchId,
    transactionId,
  });
  if (!parsed.success) return fail("plannedMatchUndoFailed");

  try {
    withDatabase((db) => {
      // The ledger looks the transaction up by batch: an unknown batch must read as gone.
      getImportBatch(db, parsed.data.batchId);
      undoMatch(db, parsed.data.batchId, parsed.data.transactionId);
    });
    refreshData();
    return { status: "done", message: t("undone") };
  } catch (error) {
    return failFrom(error, "plannedMatchUndoFailed", "Undoing a planned match failed");
  }
}
