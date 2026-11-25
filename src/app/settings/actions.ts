"use server";

import { messageRef } from "../../domain/message";
import { TransactionValidationError } from "../../domain/transaction";
import { setDefaultPaymentMode } from "../../ledger/default-payment-mode";
import { withDatabase } from "../../storage/with-database";
import { requireSession } from "../auth/session";
import { refreshData } from "../data-cache";
import { flashError, flashSuccess } from "../feedback/flash";

/** A plain form post, like setThemeAction, so it works without JavaScript; the outcome is a toast. */
export async function setDefaultPaymentModeAction(formData: FormData): Promise<void> {
  await requireSession();

  try {
    withDatabase((db) => setDefaultPaymentMode(db, formData.get("paymentMode")));
  } catch (error) {
    if (error instanceof TransactionValidationError) {
      await flashError(error.ref);
      return;
    }
    console.error("Default payment mode action failed", error);
    await flashError(messageRef("nothingSaved"));
    return;
  }

  refreshData();
  await flashSuccess("defaultPaymentModeSaved");
}
