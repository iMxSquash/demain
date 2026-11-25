import { eq } from "drizzle-orm";

import { assertPaymentMode, isPaymentMode, type PaymentMode } from "../domain/transaction";
import type { AppDatabase } from "../storage/database";
import { settings } from "../storage/schema";

const DEFAULT_PAYMENT_MODE_KEY = "default_payment_mode";
const FALLBACK_PAYMENT_MODE: PaymentMode = "card";

/**
 * The setting only pre-fills a form, so an unreadable stored value (a mode
 * removed in a later version, a hand-edited database) falls back to card
 * instead of making every transaction form fail.
 */
export function getDefaultPaymentMode(db: AppDatabase): PaymentMode {
  const row = db.select().from(settings).where(eq(settings.key, DEFAULT_PAYMENT_MODE_KEY)).get();
  return isPaymentMode(row?.value) ? row.value : FALLBACK_PAYMENT_MODE;
}

export function setDefaultPaymentMode(db: AppDatabase, mode: unknown): void {
  assertPaymentMode(mode);
  db.insert(settings)
    .values({ key: DEFAULT_PAYMENT_MODE_KEY, value: mode })
    .onConflictDoUpdate({ target: settings.key, set: { value: mode } })
    .run();
}
