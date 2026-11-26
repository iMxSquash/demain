"use server";

import { ExchangeRateValidationError } from "../../domain/exchange-rate";
import { messageRef, type MessageRef, type Translate } from "../../domain/message";
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
import { refreshData } from "../data-cache";
import { flashError, flashSuccess, runWithNotice } from "../feedback/flash";
import { getTranslator } from "../translator";
import {
  parseCurrencyCode,
  readRateValues,
  type RateFormState,
  type ReferenceCurrencyFormState,
} from "./currency-form-data";

export async function saveReferenceCurrencyAction(
  _previous: ReferenceCurrencyFormState | null,
  formData: FormData,
): Promise<ReferenceCurrencyFormState | null> {
  await requireSession();
  const translate = await getTranslator();
  const reading = parseCurrencyCode(formData);
  if (!reading.ok) return { message: translate(reading.ref), value: reading.value };
  const value = reading.code;

  try {
    withDatabase((db) => setReferenceCurrency(db, value));
  } catch (error) {
    if (error instanceof ExchangeRateValidationError) {
      return { message: translate(error.ref), value };
    }
    console.error("Reference currency action failed", error);
    return { message: translate(messageRef("exchangeRateNotSaved")), value };
  }

  refreshData();
  await flashSuccess("referenceCurrencySaved");
  return null;
}

/** A failure that no field explains is told in a toast. */
async function toRateFormState(
  error: unknown,
  formData: FormData,
  translate: Translate,
): Promise<RateFormState> {
  const values = readRateValues(formData);
  if (error instanceof ExchangeRateValidationError) {
    return { field: error.field, message: translate(error.ref), values };
  }
  // Unexpected failures are logged with their detail, the user sees a generic message.
  console.error("Exchange rate action failed", error);
  const ref = messageRef("exchangeRateNotSaved");
  await flashError(ref);
  return { message: translate(ref), values };
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
    return await toRateFormState(error, formData, translate);
  }

  refreshData();
  await flashSuccess("exchangeRateSaved");
  return null;
}

function describeSettingFailure(error: unknown): MessageRef {
  console.error("Currency change failed", error);
  return messageRef("nothingSaved");
}

export async function deleteExchangeRateAction(id: number): Promise<void> {
  await requireSession();
  await runWithNotice(() => withDatabase((db) => deleteExchangeRate(db, id)), {
    success: "exchangeRateDeleted",
    describeFailure: describeSettingFailure,
  });
  refreshData();
}

export async function setEcbFetchEnabledAction(enabled: boolean): Promise<void> {
  await requireSession();
  await runWithNotice(() => withDatabase((db) => setEcbFetchEnabled(db, enabled)), {
    success: enabled ? "ecbFetchTurnedOn" : "ecbFetchTurnedOff",
    describeFailure: describeSettingFailure,
  });
  refreshData();
}

function describeEcbFetchFailure(error: unknown): MessageRef {
  if (error instanceof EcbFetchDisabledError) return messageRef("ecbFetchDisabled");
  console.error("ECB fetch failed", error);
  return messageRef("ecbFetchFailed");
}

/** The only outbound call of the app, made on the owner's click and nowhere else. */
export async function fetchEcbRatesAction(): Promise<void> {
  await requireSession();
  let storedCount: number;
  try {
    storedCount = await withDatabaseAsync((db) => fetchEcbRates(db, fetch));
  } catch (error) {
    await flashError(describeEcbFetchFailure(error));
    return;
  }
  refreshData();
  await flashSuccess("ecbRatesStored", { count: storedCount });
}
