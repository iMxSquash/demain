import { MoneyParseError, parseAmount } from "../../domain/money";
import type { TransactionInput } from "../../domain/transaction";
import type {
  SurplusDecision,
  TransferRequest,
} from "../../ledger/transactions";
import { TRANSFER_DECISION } from "./transfer-decision";

/** Currency of each known account, so that text amounts are read exactly. */
export type CurrencyByAccount = ReadonlyMap<number, string>;

export type TransactionFormField =
  | "accountId"
  | "date"
  | "kind"
  | "amount"
  | "label"
  | "description"
  | "paymentMode"
  | "categoryId";

export interface TransactionFormValues {
  accountId: string;
  date: string;
  kind: string;
  /** Unsigned: the kind decides the direction. */
  amount: string;
  label: string;
  description: string;
  paymentMode: string;
  /** Category id as text, blank means none: the transaction is to categorize. */
  categoryId: string;
}

export interface TransactionFormState {
  status: "error" | "notice";
  field?: TransactionFormField;
  message: string;
  /** What the user typed: React resets the form after an action, so it is sent back. */
  values: TransactionFormValues;
}

export type TransferFormField =
  | "sourceId"
  | "destinationId"
  | "date"
  | "amount"
  | "label"
  | "surplusAccountId";

export interface TransferFormValues {
  sourceId: string;
  destinationId: string;
  date: string;
  amount: string;
  label: string;
}

/** Shown when the destination cannot take the whole amount. */
export interface SurplusChoice {
  depositedText: string;
  surplusText: string;
  /** Overflow account to preselect, as text, blank when there is none. */
  suggestedAccountId: string;
}

export interface TransferFormState {
  status: "error" | "notice";
  field?: TransferFormField;
  message: string;
  values: TransferFormValues;
  surplusChoice?: SurplusChoice;
}

export type ParsedTransactionForm =
  | { ok: true; input: TransactionInput }
  | { ok: false; error: TransactionFormState };

export type ParsedTransferForm =
  | {
      ok: true;
      request: TransferRequest;
      decision: SurplusDecision | null;
    }
  | { ok: false; error: TransferFormState };

function readText(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

export function readTransactionValues(formData: FormData): TransactionFormValues {
  return {
    accountId: readText(formData, "accountId"),
    date: readText(formData, "date"),
    kind: readText(formData, "kind"),
    amount: readText(formData, "amount"),
    label: readText(formData, "label"),
    description: readText(formData, "description"),
    paymentMode: readText(formData, "paymentMode"),
    categoryId: readText(formData, "categoryId"),
  };
}

export function readTransferValues(formData: FormData): TransferFormValues {
  return {
    sourceId: readText(formData, "sourceId"),
    destinationId: readText(formData, "destinationId"),
    date: readText(formData, "date"),
    amount: readText(formData, "amount"),
    label: readText(formData, "label"),
  };
}

function readAccount(
  text: string,
  known: CurrencyByAccount,
): { id: number; currency: string } | null {
  const id = Number(text);
  const currency = text.trim() === "" ? undefined : known.get(id);
  return currency === undefined ? null : { id, currency };
}

type AmountResult = { value: number } | { message: string };

// The amount is typed without a sign: a minus sign is refused rather than
// guessed, since "expense" and "-" would otherwise contradict each other.
function readUnsignedAmount(text: string, currency: string): AmountResult {
  try {
    const value = parseAmount(text, currency);
    if (value < 0) {
      return {
        message: "Enter the amount without a sign: the type sets the direction",
      };
    }
    return { value };
  } catch (error) {
    if (error instanceof MoneyParseError) return { message: error.message };
    throw error;
  }
}

/** Converts submitted text to a typed input. Amounts never go through a float. */
export function parseTransactionForm(
  formData: FormData,
  currencies: CurrencyByAccount,
): ParsedTransactionForm {
  const values = readTransactionValues(formData);
  const fail = (field: TransactionFormField, message: string) => ({
    ok: false as const,
    error: { status: "error" as const, field, message, values },
  });

  const account = readAccount(values.accountId, currencies);
  if (account === null) return fail("accountId", "Unknown account");

  const amount = readUnsignedAmount(values.amount, account.currency);
  if ("message" in amount) return fail("amount", amount.message);

  const rawCategory = values.categoryId.trim();
  const categoryId = rawCategory === "" ? null : Number(rawCategory);
  if (categoryId !== null && !Number.isSafeInteger(categoryId)) {
    return fail("categoryId", "Unknown category");
  }

  const isExpense = values.kind === "expense";
  return {
    ok: true,
    input: {
      accountId: account.id,
      date: values.date,
      amount: isExpense ? -amount.value : amount.value,
      // The domain refuses an unknown kind: it is passed through untouched.
      kind: values.kind as TransactionInput["kind"],
      label: values.label,
      description: values.description,
      paymentMode: values.paymentMode === "" ? null : values.paymentMode,
      categoryId,
    },
  };
}

type DecisionResult =
  | { value: SurplusDecision | null }
  | { message: string };

// No decision is the normal first submit: the form then shows the split.
function readDecision(
  formData: FormData,
  currencies: CurrencyByAccount,
): DecisionResult {
  const decision = readText(formData, "decision");
  if (decision === TRANSFER_DECISION.roomOnly) {
    return { value: { kind: "room-only" } };
  }
  if (decision !== TRANSFER_DECISION.sendSurplus) return { value: null };

  const account = readAccount(readText(formData, "surplusAccountId"), currencies);
  if (account === null) {
    return { message: "Choose the account that receives the surplus" };
  }
  return { value: { kind: "send-surplus", accountId: account.id } };
}

export function parseTransferForm(
  formData: FormData,
  currencies: CurrencyByAccount,
): ParsedTransferForm {
  const values = readTransferValues(formData);
  const fail = (field: TransferFormField, message: string) => ({
    ok: false as const,
    error: { status: "error" as const, field, message, values },
  });

  const source = readAccount(values.sourceId, currencies);
  if (source === null) return fail("sourceId", "Unknown source account");
  const destination = readAccount(values.destinationId, currencies);
  if (destination === null) {
    return fail("destinationId", "Unknown destination account");
  }

  const amount = readUnsignedAmount(values.amount, source.currency);
  if ("message" in amount) return fail("amount", amount.message);

  const request: TransferRequest = {
    sourceId: source.id,
    destinationId: destination.id,
    amount: amount.value,
    date: values.date,
    label: values.label,
  };

  const decision = readDecision(formData, currencies);
  if ("message" in decision) return fail("surplusAccountId", decision.message);
  return { ok: true, request, decision: decision.value };
}
