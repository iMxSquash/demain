import type {
  EnteredTransactionKind,
  PaymentMode,
} from "../../domain/transaction";

export const KIND_LABELS: Record<EnteredTransactionKind | "transfer", string> = {
  expense: "Expense",
  income: "Income",
  interest: "Interest",
  transfer: "Transfer",
};

export const PAYMENT_MODE_LABELS: Record<PaymentMode, string> = {
  card: "Card",
  transfer: "Transfer",
  direct_debit: "Direct debit",
};
