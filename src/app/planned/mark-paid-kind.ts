import type { FeedbackKey } from "../../domain/message";
import type { PlannedItemKind } from "../../domain/planned-item";

/**
 * The type that names the button of an occurrence and its toast (owner, 24 Nov 2026): "Mark as
 * paid" for an expense, "Mark as received" for an income, "Mark as transferred" for a transfer. An
 * interest enters the account like an income, so it is received.
 */
export type MarkPaidKind = "expense" | "income" | "transfer";

export function markPaidKindOf(kind: PlannedItemKind): MarkPaidKind {
  return kind === "interest" ? "income" : kind;
}

export const MARKED_FEEDBACK: Record<MarkPaidKind, FeedbackKey> = {
  expense: "occurrenceMarkedPaid",
  income: "occurrenceMarkedReceived",
  transfer: "occurrenceMarkedTransferred",
};
