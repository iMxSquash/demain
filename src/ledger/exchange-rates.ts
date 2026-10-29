import { asc, eq } from "drizzle-orm";

import {
  assertKnownCurrency,
  parseEcbRates,
  validateExchangeRateInput,
  type ExchangeRateInput,
} from "../domain/exchange-rate";
import type { AppDatabase } from "../storage/database";
import { exchangeRates, settings } from "../storage/schema";

export type StoredExchangeRate = typeof exchangeRates.$inferSelect;

const REFERENCE_CURRENCY_KEY = "reference_currency";
const DEFAULT_REFERENCE_CURRENCY = "EUR";
const ECB_FETCH_ENABLED_KEY = "ecb_fetch_enabled";
const ECB_FEED_URL =
  "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml";
const ECB_TIMEOUT_MS = 10_000;

function readSetting(db: AppDatabase, key: string): string | undefined {
  return db.select().from(settings).where(eq(settings.key, key)).get()?.value;
}

function writeSetting(db: AppDatabase, key: string, value: string): void {
  db.insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } })
    .run();
}

export function getReferenceCurrency(db: AppDatabase): string {
  return readSetting(db, REFERENCE_CURRENCY_KEY) ?? DEFAULT_REFERENCE_CURRENCY;
}

/** Totals are converted at read time, so changing it rewrites no stored data. */
export function setReferenceCurrency(db: AppDatabase, currency: string): void {
  assertKnownCurrency(currency, "currency");
  writeSetting(db, REFERENCE_CURRENCY_KEY, currency);
}

/** Records a rate typed by the owner, replacing the one of the same pair and day. */
export function saveExchangeRate(
  db: AppDatabase,
  input: ExchangeRateInput,
): StoredExchangeRate {
  const valid = validateExchangeRateInput(input);
  return db
    .insert(exchangeRates)
    .values({ ...valid, source: "manual" })
    .onConflictDoUpdate({
      target: [exchangeRates.base, exchangeRates.quote, exchangeRates.date],
      set: { rate: valid.rate, source: "manual" },
    })
    .returning()
    .get();
}

export function listExchangeRates(db: AppDatabase): StoredExchangeRate[] {
  return db
    .select()
    .from(exchangeRates)
    .orderBy(
      asc(exchangeRates.base),
      asc(exchangeRates.quote),
      asc(exchangeRates.date),
    )
    .all();
}

export function deleteExchangeRate(db: AppDatabase, id: number): void {
  db.delete(exchangeRates).where(eq(exchangeRates.id, id)).run();
}

export class EcbFetchDisabledError extends Error {
  constructor() {
    super("The ECB rate fetch is disabled: enable it in the settings first");
    this.name = "EcbFetchDisabledError";
  }
}

export class EcbFetchError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "EcbFetchError";
  }
}

/** Off until the owner turns it on: it is the only outbound call of the app. */
export function isEcbFetchEnabled(db: AppDatabase): boolean {
  return readSetting(db, ECB_FETCH_ENABLED_KEY) === "true";
}

export function setEcbFetchEnabled(db: AppDatabase, enabled: boolean): void {
  writeSetting(db, ECB_FETCH_ENABLED_KEY, String(enabled));
}

/**
 * Fetches the ECB daily reference rates and stores them. The request carries
 * nothing of the owner's data. A rate the owner typed for the same day is kept.
 * Returns how many rates were stored; nothing is stored when the feed is invalid.
 */
export async function fetchEcbRates(
  db: AppDatabase,
  fetchFeed: typeof fetch,
): Promise<number> {
  if (!isEcbFetchEnabled(db)) {
    throw new EcbFetchDisabledError();
  }

  let xml: string;
  try {
    const response = await fetchFeed(ECB_FEED_URL, {
      signal: AbortSignal.timeout(ECB_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new EcbFetchError(`The ECB answered with status ${response.status}`);
    }
    xml = await response.text();
  } catch (error) {
    if (error instanceof EcbFetchError) {
      throw error;
    }
    throw new EcbFetchError("The ECB feed could not be fetched", { cause: error });
  }

  const rates = parseEcbRates(xml);
  return db.transaction((tx) =>
    rates.reduce(
      (stored, rate) =>
        stored +
        tx
          .insert(exchangeRates)
          .values({ ...rate, source: "ecb" })
          .onConflictDoUpdate({
            target: [exchangeRates.base, exchangeRates.quote, exchangeRates.date],
            set: { rate: rate.rate },
            setWhere: eq(exchangeRates.source, "ecb"),
          })
          .returning()
          .all().length,
      0,
    ),
  );
}
