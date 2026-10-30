"use server";

import { getLocale } from "next-intl/server";
import { redirect } from "next/navigation";

import { messageRef, type MessageRef, type Translate } from "../../domain/message";
import { formatAmount } from "../../domain/money";
import {
  TransactionValidationError,
  type CeilingWarning,
  type ManualTransferSplit,
  type TransactionField,
} from "../../domain/transaction";
import { AccountNotFoundError, listAccounts } from "../../ledger/accounts";
import { CategoryNotFoundError } from "../../ledger/categories";
import {
  createTransaction,
  deleteTransaction,
  previewCeilingWarning,
  previewManualTransfer,
  recordManualTransfer,
  TransactionNotFoundError,
  updateTransaction,
  type SurplusDecision,
  type TransferRequest,
} from "../../ledger/transactions";
import type { AppDatabase } from "../../storage/database";
import { withDatabase } from "../../storage/with-database";
import { revalidateLedger } from "../revalidate-ledger";
import { requireSession } from "../auth/session";
import { flashError, flashSuccess, runWithNotice } from "../feedback/flash";
import { getTranslator } from "../translator";
import {
  parseTransactionForm,
  parseTransferForm,
  readTransactionValues,
  readTransferValues,
  type CurrencyByAccount,
  type TransactionFormState,
  type TransferFormField,
  type TransferFormState,
  type TransferFormValues,
} from "./transaction-form-data";
import { TRANSFER_DECISION } from "./transfer-decision";

const TRANSACTIONS_PATH = "/transactions";

function loadCurrencies(): CurrencyByAccount {
  return withDatabase(
    (db) =>
      new Map(listAccounts(db).map((account) => [account.id, account.currency])),
  );
}

// The transfer form names its accounts differently: a failure on "accountId"
// or "kind" has no single field there and is shown at the top of the form.
const TRANSFER_FIELD_OF: Partial<Record<TransactionField, TransferFormField>> = {
  amount: "amount",
  date: "date",
  label: "label",
};

// A missing account would be a bug: fail fast instead of showing another currency.
function formatMinorUnits(
  currencies: CurrencyByAccount,
  accountId: number,
  minorUnits: number,
  locale: string,
): string {
  const currency = currencies.get(accountId);
  if (currency === undefined) {
    throw new Error(`Unknown account ${accountId}`);
  }
  return formatAmount(minorUnits, currency, locale);
}

function describeFailure(error: unknown): {
  field?: TransactionField;
  ref: MessageRef;
} {
  if (error instanceof TransactionValidationError) {
    return { field: error.field, ref: error.ref };
  }
  if (error instanceof CategoryNotFoundError) {
    return { field: "categoryId", ref: messageRef("categoryGone") };
  }
  if (error instanceof AccountNotFoundError) {
    return { ref: messageRef("accountGone") };
  }
  if (error instanceof TransactionNotFoundError) {
    return { ref: messageRef("transactionGone") };
  }
  // Unexpected failures are logged with their detail, the user sees a generic message.
  console.error("Transaction action failed", error);
  return { ref: messageRef("nothingSaved") };
}

/**
 * The ceiling warning stays next to the form: it carries a figure, and the
 * toast only holds a message key. Null when there is nothing to warn about.
 */
function ceilingNotice(
  currencies: CurrencyByAccount,
  accountId: number,
  warning: CeilingWarning | null,
  translate: Translate,
  locale: string,
): string | null {
  if (warning === null) return null;
  const excess = formatMinorUnits(currencies, accountId, warning.excess, locale);
  return translate(messageRef("ceilingWarning", { excess }));
}

/** A failure that no field explains is told in a toast. */
async function transactionFailure(
  error: unknown,
  formData: FormData,
  translate: Translate,
): Promise<TransactionFormState> {
  const { field, ref } = describeFailure(error);
  if (field === undefined) await flashError(ref);
  return {
    status: "error",
    field,
    message: translate(ref),
    values: readTransactionValues(formData),
  };
}

export async function createTransactionAction(
  _previous: TransactionFormState | null,
  formData: FormData,
): Promise<TransactionFormState | null> {
  await requireSession();
  const [translate, locale] = await Promise.all([getTranslator(), getLocale()]);
  const currencies = loadCurrencies();
  const parsed = parseTransactionForm(formData, currencies, translate);
  if (!parsed.ok) return parsed.error;

  let warning;
  try {
    warning = withDatabase((db) => {
      const found = previewCeilingWarning(db, parsed.input);
      createTransaction(db, parsed.input);
      return found;
    });
  } catch (error) {
    return await transactionFailure(error, formData, translate);
  }

  revalidateLedger();
  await flashSuccess("transactionRecorded");
  // Keep account and date for the next entry, clear what is specific to this one.
  const values = {
    ...readTransactionValues(formData),
    amount: "",
    label: "",
    description: "",
    paymentMode: "",
  };
  const notice = ceilingNotice(currencies, parsed.input.accountId, warning, translate, locale);
  return notice === null
    ? { status: "saved", values }
    : { status: "notice", message: notice, values };
}

export async function updateTransactionAction(
  id: number,
  _previous: TransactionFormState | null,
  formData: FormData,
): Promise<TransactionFormState | null> {
  await requireSession();
  const [translate, locale] = await Promise.all([getTranslator(), getLocale()]);
  const currencies = loadCurrencies();
  const parsed = parseTransactionForm(formData, currencies, translate);
  if (!parsed.ok) return parsed.error;

  let warning;
  try {
    warning = withDatabase((db) => {
      const found = previewCeilingWarning(db, parsed.input, {
        replacingTransactionId: id,
      });
      updateTransaction(db, id, parsed.input);
      return found;
    });
  } catch (error) {
    return await transactionFailure(error, formData, translate);
  }

  revalidateLedger();
  await flashSuccess("changesSaved");
  // redirect throws, so it stays outside the try block. A warning keeps the
  // user on the form, since a redirect would drop it.
  const notice = ceilingNotice(currencies, parsed.input.accountId, warning, translate, locale);
  if (notice === null) redirect(TRANSACTIONS_PATH);
  return { status: "notice", message: notice, values: readTransactionValues(formData) };
}

function describeDeleteFailure(error: unknown): MessageRef {
  if (error instanceof TransactionNotFoundError) return messageRef("transactionGone");
  console.error("Transaction delete failed", error);
  return messageRef("transactionNotDeleted");
}

export async function deleteTransactionAction(id: number): Promise<void> {
  await requireSession();
  await runWithNotice(() => withDatabase((db) => deleteTransaction(db, id)), {
    success: "transactionDeleted",
    describeFailure: describeDeleteFailure,
  });
  revalidateLedger();
}

// First submit of a transfer that does not fit: nothing is recorded, the form
// shows the split and waits for the decision of the user.
function askForDecision(
  split: ManualTransferSplit,
  values: TransferFormValues,
  format: (minorUnits: number) => string,
  translate: Translate,
): TransferFormState {
  return {
    status: "notice",
    message: translate(messageRef("transferSurplusAsk")),
    values,
    surplusChoice: {
      depositedText: format(split.deposited),
      surplusText: format(split.surplus),
      suggestedAccountId:
        split.suggestedOverflowAccountId === null
          ? ""
          : String(split.suggestedOverflowAccountId),
    },
  };
}

/** What the form shows next, and whether the transfer was recorded (a toast then tells it). */
interface TransferOutcome {
  state: TransferFormState;
  isRecorded: boolean;
}

function recordTransfer(
  db: AppDatabase,
  request: TransferRequest,
  decision: SurplusDecision | null,
  values: TransferFormValues,
  format: (minorUnits: number) => string,
  translate: Translate,
): TransferOutcome {
  if (decision === null) {
    const split = previewManualTransfer(db, request);
    if (split.surplus > 0) {
      return { state: askForDecision(split, values, format, translate), isRecorded: false };
    }
  }
  const result = recordManualTransfer(db, request, decision);
  revalidateLedger();
  const clearedValues = { ...values, amount: "", label: "" };
  // The unplaced surplus carries a figure, so it stays next to the form.
  const state: TransferFormState =
    result.unplaced > 0
      ? {
          status: "notice",
          message: translate(
            messageRef("transferUnplaced", { amount: format(result.unplaced) }),
          ),
          values: clearedValues,
        }
      : { status: "saved", values: clearedValues };
  return { state, isRecorded: true };
}

export async function createTransferAction(
  _previous: TransferFormState | null,
  formData: FormData,
): Promise<TransferFormState | null> {
  await requireSession();
  const [translate, locale] = await Promise.all([getTranslator(), getLocale()]);
  const values = readTransferValues(formData);
  if (formData.get("decision") === TRANSFER_DECISION.cancel) {
    return {
      status: "notice",
      message: translate(messageRef("transferCancelled")),
      values,
    };
  }

  const currencies = loadCurrencies();
  const parsed = parseTransferForm(formData, currencies, translate);
  if (!parsed.ok) return parsed.error;
  const { request, decision } = parsed;
  const format = (minorUnits: number) =>
    formatMinorUnits(currencies, request.sourceId, minorUnits, locale);

  let outcome: TransferOutcome;
  try {
    outcome = withDatabase((db) =>
      recordTransfer(db, request, decision, values, format, translate),
    );
  } catch (error) {
    const { field, ref } = describeFailure(error);
    const transferField = field === undefined ? undefined : TRANSFER_FIELD_OF[field];
    if (transferField === undefined) await flashError(ref);
    return { status: "error", field: transferField, message: translate(ref), values };
  }
  if (outcome.isRecorded) await flashSuccess("transferRecorded");
  return outcome.state;
}
