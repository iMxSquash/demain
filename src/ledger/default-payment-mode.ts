import { assertPaymentMode, isPaymentMode, type PaymentMode } from "../domain/transaction";
import type { AppDatabase } from "../storage/database";
import { readSetting, writeSetting } from "./settings";

const DEFAULT_PAYMENT_MODE_KEY = "default_payment_mode";
const FALLBACK_PAYMENT_MODE: PaymentMode = "card";

/**
 * The setting only pre-fills a form, so an unreadable stored value (a mode
 * removed in a later version, a hand-edited database) falls back to card
 * instead of making every transaction form fail.
 */
export function getDefaultPaymentMode(db: AppDatabase): PaymentMode {
  const stored = readSetting(db, DEFAULT_PAYMENT_MODE_KEY);
  return isPaymentMode(stored) ? stored : FALLBACK_PAYMENT_MODE;
}

export function setDefaultPaymentMode(db: AppDatabase, mode: unknown): void {
  assertPaymentMode(mode);
  writeSetting(db, DEFAULT_PAYMENT_MODE_KEY, mode);
}
