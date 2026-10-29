"use server";

import { revalidatePath } from "next/cache";

import { ExchangeRateValidationError } from "../../domain/exchange-rate";
import { messageRef, type Translate } from "../../domain/message";
import {
  deleteExchangeRate,
  EcbFetchDisabledError,
  fetchEcbRates,
  saveExchangeRate,
  setEcbFetchEnabled,
  setReferenceCurrency,
} from "../../ledger/exchange-rates";
import { withDatabase, withDatabaseAsync } from "../../storage/with-database";
import { requireSession } from "../auth/session";
import { revalidateLedger } from "../revalidate-ledger";
import { getTranslator } from "../translator";
import {
  readCurrency,
  readRateValues,
  type EcbFetchState,
  type RateFormState,
  type ReferenceCurrencyFormState,
} from "./currency-form-data";

const CURRENCIES_PATH = "/currencies";

// Rates change the figures of every page that converts, not only this one.
function revalidateConversions(): void {
  revalidatePath(CURRENCIES_PATH);
  revalidateLedger();
}

export async function saveReferenceCurrencyAction(
  _previous: ReferenceCurrencyFormState | null,
  formData: FormData,
): Promise<ReferenceCurrencyFormState | null> {
  await requireSession();
  const translate = await getTranslator();
  const value = readCurrency(formData);

  try {
    withDatabase((db) => setReferenceCurrency(db, value));
  } catch (error) {
    if (error instanceof ExchangeRateValidationError) {
      return { message: translate(error.ref), value };
    }
    console.error("Reference currency action failed", error);
    return { message: translate(messageRef("exchangeRateNotSaved")), value };
  }

  revalidateConversions();
  return null;
}

function toRateFormState(
  error: unknown,
  formData: FormData,
  translate: Translate,
): RateFormState {
  const values = readRateValues(formData);
  if (error instanceof ExchangeRateValidationError) {
    return { field: error.field, message: translate(error.ref), values };
  }
  // Unexpected failures are logged with their detail, the user sees a generic message.
  console.error("Exchange rate action failed", error);
  return { message: translate(messageRef("exchangeRateNotSaved")), values };
}

export async function saveExchangeRateAction(
  _previous: RateFormState | null,
  formData: FormData,
): Promise<RateFormState | null> {
  await requireSession();
  const translate = await getTranslator();

  try {
    withDatabase((db) => saveExchangeRate(db, readRateValues(formData)));
  } catch (error) {
    return toRateFormState(error, formData, translate);
  }

  revalidateConversions();
  return null;
}

export async function deleteExchangeRateAction(id: number): Promise<void> {
  await requireSession();
  withDatabase((db) => deleteExchangeRate(db, id));
  revalidateConversions();
}

export async function setEcbFetchEnabledAction(
  enabled: boolean,
): Promise<void> {
  await requireSession();
  withDatabase((db) => setEcbFetchEnabled(db, enabled));
  revalidatePath(CURRENCIES_PATH);
}

/** The only outbound call of the app, made on the owner's click and nowhere else. */
export async function fetchEcbRatesAction(): Promise<EcbFetchState> {
  await requireSession();
  const translate = await getTranslator();

  try {
    const count = await withDatabaseAsync((db) => fetchEcbRates(db, fetch));
    revalidateConversions();
    return { storedCount: count };
  } catch (error) {
    if (error instanceof EcbFetchDisabledError) {
      return { error: translate(messageRef("ecbFetchDisabled")) };
    }
    console.error("ECB fetch failed", error);
    return { error: translate(messageRef("ecbFetchFailed")) };
  }
}
