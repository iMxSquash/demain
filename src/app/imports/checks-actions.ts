"use server";

import { getLocale, getTranslations } from "next-intl/server";
import { z } from "zod";

import { parseRealBalance, RealBalanceError } from "../../domain/batch-balance";
import { messageRef, type FeedbackKey } from "../../domain/message";
import { formatAmount } from "../../domain/money";
import { formatCalendarDate } from "../../i18n/dates";
import {
  batchBalanceGap,
  getBatchBalanceCheck,
  ImportBatchNotFoundError,
  ImportBatchWithoutMovementError,
} from "../../ledger/import-checks";
import { withDatabase } from "../../storage/with-database";
import { requireSession } from "../auth/session";
import { getTranslator } from "../translator";
import type { BalanceCheckState } from "./import-form-data";

const MAX_BALANCE_TEXT_LENGTH = 100;

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
  const [t, translate, locale] = await Promise.all([
    getTranslations("imports.staged.balanceCheck"),
    getTranslator(),
    getLocale(),
  ]);
  const fail = (key: FeedbackKey): BalanceCheckState => ({
    status: "error",
    message: translate(messageRef(key)),
  });

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
    if (gap === 0) return { status: "gap", message: t("gapMatch", values) };
    return {
      status: "gap",
      message: t(gap > 0 ? "gapMore" : "gapLess", values),
    };
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
