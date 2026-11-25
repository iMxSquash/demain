"use server";

import { messageRef, type MessageRef } from "../../domain/message";
import { TransactionValidationError } from "../../domain/transaction";
import { setDefaultPaymentMode } from "../../ledger/default-payment-mode";
import { withDatabase } from "../../storage/with-database";
import { requireSession } from "../auth/session";
import { refreshData } from "../data-cache";
import { runWithNotice } from "../feedback/flash";

function describeDefaultPaymentModeFailure(error: unknown): MessageRef {
  if (error instanceof TransactionValidationError) return error.ref;
  console.error("Default payment mode action failed", error);
  return messageRef("nothingSaved");
}

/** A plain form post, like setThemeAction, so it works without JavaScript; the outcome is a toast. */
export async function setDefaultPaymentModeAction(formData: FormData): Promise<void> {
  await requireSession();
  // Refreshed inside the change, so a refused value leaves the cached reads alone.
  await runWithNotice(
    () => {
      withDatabase((db) => setDefaultPaymentMode(db, formData.get("paymentMode")));
      refreshData();
    },
    { success: "defaultPaymentModeSaved", describeFailure: describeDefaultPaymentModeFailure },
  );
}
