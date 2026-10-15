"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

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
import { DISPLAY_LOCALE } from "../display-locale";
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
const ACCOUNTS_PATH = "/accounts";
const GENERIC_ERROR = "Something went wrong, nothing was saved.";

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
): string {
  const currency = currencies.get(accountId);
  if (currency === undefined) {
    throw new Error(`Unknown account ${accountId}`);
  }
  return formatAmount(minorUnits, currency, DISPLAY_LOCALE);
}

function describeFailure(error: unknown): {
  field?: TransactionField;
  message: string;
} {
  if (error instanceof TransactionValidationError) {
    return { field: error.field, message: error.message };
  }
  if (error instanceof CategoryNotFoundError) {
    return { field: "categoryId", message: "This category no longer exists." };
  }
  if (error instanceof AccountNotFoundError) {
    return { message: "This account no longer exists." };
  }
  if (error instanceof TransactionNotFoundError) {
    return { message: "This transaction no longer exists." };
  }
  // Unexpected failures are logged with their detail, the user sees a generic message.
  console.error("Transaction action failed", error);
  return { message: GENERIC_ERROR };
}

function revalidateLedger(): void {
  // Balances on the accounts page change with every movement.
  revalidatePath(TRANSACTIONS_PATH);
  revalidatePath(ACCOUNTS_PATH);
}

function ceilingWarningText(
  currencies: CurrencyByAccount,
  accountId: number,
  warning: CeilingWarning | null,
): string {
  if (warning === null) return "";
  const excess = formatMinorUnits(currencies, accountId, warning.excess);
  return ` Warning: this income exceeds the deposit ceiling of the account by ${excess}.`;
}

function transactionFailure(
  error: unknown,
  formData: FormData,
): TransactionFormState {
  const { field, message } = describeFailure(error);
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
  const currencies = loadCurrencies();
  const parsed = parseTransactionForm(formData, currencies);
  if (!parsed.ok) return parsed.error;

  let warning;
  try {
    warning = withDatabase((db) => {
      const found = previewCeilingWarning(db, parsed.input);
      createTransaction(db, parsed.input);
      return found;
    });
  } catch (error) {
    return transactionFailure(error, formData);
  }

  revalidateLedger();
  // Keep account and date for the next entry, clear what is specific to this one.
  return {
    status: "notice",
    message: `Transaction recorded.${ceilingWarningText(currencies, parsed.input.accountId, warning)}`,
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
  const currencies = loadCurrencies();
  const parsed = parseTransactionForm(formData, currencies);
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
    return transactionFailure(error, formData);
  }

  revalidateLedger();
  // redirect throws, so it stays outside the try block. A warning keeps the
  // user on the form, since a redirect would drop the message.
  if (warning === null) redirect(TRANSACTIONS_PATH);
  return {
    status: "notice",
    message: `Changes saved.${ceilingWarningText(currencies, parsed.input.accountId, warning)}`,
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
): TransferFormState {
  return {
    status: "notice",
    message: "The destination account cannot take the whole amount.",
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
): TransferFormState {
  if (decision === null) {
    const split = previewManualTransfer(db, request);
    if (split.surplus > 0) return askForDecision(split, values, format);
  }
  const result = recordManualTransfer(db, request, decision);
  const unplaced =
    result.unplaced > 0
      ? ` ${format(result.unplaced)} fits nowhere and stays in the source account.`
      : "";
  revalidateLedger();
  return {
    status: "notice",
    message: `Transfer recorded.${unplaced}`,
    values: { ...values, amount: "", label: "" },
  };
}

export async function createTransferAction(
  _previous: TransferFormState | null,
  formData: FormData,
): Promise<TransferFormState | null> {
  const values = readTransferValues(formData);
  if (formData.get("decision") === TRANSFER_DECISION.cancel) {
    return {
      status: "notice",
      message: "Transfer cancelled: nothing was recorded.",
      values,
    };
  }

  const currencies = loadCurrencies();
  const parsed = parseTransferForm(formData, currencies);
  if (!parsed.ok) return parsed.error;
  const { request, decision } = parsed;
  const format = (minorUnits: number) =>
    formatMinorUnits(currencies, request.sourceId, minorUnits);

  try {
    return withDatabase((db) =>
      recordTransfer(db, request, decision, values, format),
    );
  } catch (error) {
    const { field, message } = describeFailure(error);
    return {
      status: "error",
      field: field === undefined ? undefined : TRANSFER_FIELD_OF[field],
      message,
      values,
    };
  }
}
