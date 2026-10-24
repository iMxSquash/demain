"use server";

import { getLocale } from "next-intl/server";
import { redirect } from "next/navigation";

import { messageRef, type Translate } from "../../domain/message";
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

function describeFailure(
  error: unknown,
  translate: Translate,
): {
  field?: TransactionField;
  message: string;
} {
  if (error instanceof TransactionValidationError) {
    return { field: error.field, message: translate(error.ref) };
  }
  if (error instanceof CategoryNotFoundError) {
    return {
      field: "categoryId",
      message: translate(messageRef("categoryGone")),
    };
  }
  if (error instanceof AccountNotFoundError) {
    return { message: translate(messageRef("accountGone")) };
  }
  if (error instanceof TransactionNotFoundError) {
    return { message: translate(messageRef("transactionGone")) };
  }
  // Unexpected failures are logged with their detail, the user sees a generic message.
  console.error("Transaction action failed", error);
  return { message: translate(messageRef("nothingSaved")) };
}

/** The notice, followed by the ceiling warning when there is one. */
function noticeWithWarning(
  notice: string,
  currencies: CurrencyByAccount,
  accountId: number,
  warning: CeilingWarning | null,
  translate: Translate,
  locale: string,
): string {
  if (warning === null) return notice;
  const excess = formatMinorUnits(currencies, accountId, warning.excess, locale);
  return `${notice} ${translate(messageRef("ceilingWarning", { excess }))}`;
}

function transactionFailure(
  error: unknown,
  formData: FormData,
  translate: Translate,
): TransactionFormState {
  const { field, message } = describeFailure(error, translate);
  return {
    status: "error",
    field,
    message,
    values: readTransactionValues(formData),
  };
}

export async function createTransactionAction(
  _previous: TransactionFormState | null,
  formData: FormData,
): Promise<TransactionFormState | null> {
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
    return transactionFailure(error, formData, translate);
  }

  revalidateLedger();
  // Keep account and date for the next entry, clear what is specific to this one.
  return {
    status: "notice",
    message: noticeWithWarning(
      translate(messageRef("transactionRecorded")),
      currencies,
      parsed.input.accountId,
      warning,
      translate,
      locale,
    ),
    values: {
      ...readTransactionValues(formData),
      amount: "",
      label: "",
      description: "",
      paymentMode: "",
    },
  };
}

export async function updateTransactionAction(
  id: number,
  _previous: TransactionFormState | null,
  formData: FormData,
): Promise<TransactionFormState | null> {
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
    return transactionFailure(error, formData, translate);
  }

  revalidateLedger();
  // redirect throws, so it stays outside the try block. A warning keeps the
  // user on the form, since a redirect would drop the message.
  if (warning === null) redirect(TRANSACTIONS_PATH);
  return {
    status: "notice",
    message: noticeWithWarning(
      translate(messageRef("changesSaved")),
      currencies,
      parsed.input.accountId,
      warning,
      translate,
      locale,
    ),
    values: readTransactionValues(formData),
  };
}

export async function deleteTransactionAction(id: number): Promise<void> {
  withDatabase((db) => deleteTransaction(db, id));
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

function recordTransfer(
  db: AppDatabase,
  request: TransferRequest,
  decision: SurplusDecision | null,
  values: TransferFormValues,
  format: (minorUnits: number) => string,
  translate: Translate,
): TransferFormState {
  if (decision === null) {
    const split = previewManualTransfer(db, request);
    if (split.surplus > 0) {
      return askForDecision(split, values, format, translate);
    }
  }
  const result = recordManualTransfer(db, request, decision);
  const recorded = translate(messageRef("transferRecorded"));
  const unplaced =
    result.unplaced > 0
      ? translate(
          messageRef("transferUnplaced", { amount: format(result.unplaced) }),
        )
      : "";
  revalidateLedger();
  return {
    status: "notice",
    message: unplaced === "" ? recorded : `${recorded} ${unplaced}`,
    values: { ...values, amount: "", label: "" },
  };
}

export async function createTransferAction(
  _previous: TransferFormState | null,
  formData: FormData,
): Promise<TransferFormState | null> {
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

  try {
    return withDatabase((db) =>
      recordTransfer(db, request, decision, values, format, translate),
    );
  } catch (error) {
    const { field, message } = describeFailure(error, translate);
    return {
      status: "error",
      field: field === undefined ? undefined : TRANSFER_FIELD_OF[field],
      message,
      values,
    };
  }
}
