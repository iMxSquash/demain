import type { TransactionFormValues } from "./transaction-form-data";

interface DefaultsInput {
  /** "Today" in the user's time zone, as a calendar date. */
  today: string;
  /** Open accounts, in display order. */
  accountIds: readonly number[];
  lastAccountId: number | null;
}

/**
 * What the add-transaction form holds before the user types: an expense dated today on the
 * account used last, in the to-categorize queue. An expense then needs only an amount and a label.
 */
export function addTransactionDefaults({
  today,
  accountIds,
  lastAccountId,
}: DefaultsInput): TransactionFormValues {
  const accountId =
    lastAccountId !== null && accountIds.includes(lastAccountId) ? lastAccountId : accountIds[0];
  return {
    accountId: accountId === undefined ? "" : String(accountId),
    date: today,
    kind: "expense",
    amount: "",
    label: "",
    description: "",
    paymentMode: "",
    categoryId: "",
  };
}

/**
 * The account a transfer goes to: the one chosen while it is not the source, else the first
 * other account. Null when there is no other account.
 */
export function resolveDestination({
  accountIds,
  sourceId,
  destinationId,
}: {
  accountIds: readonly number[];
  sourceId: number;
  destinationId: string;
}): number | null {
  const chosen = Number(destinationId);
  if (destinationId !== "" && chosen !== sourceId && accountIds.includes(chosen)) return chosen;
  return accountIds.find((id) => id !== sourceId) ?? null;
}

/** The accounts that can take the surplus of a transfer: neither its source nor its destination. */
export function surplusTargets({
  accountIds,
  sourceId,
  destinationId,
}: {
  accountIds: readonly number[];
  sourceId: number;
  destinationId: number;
}): number[] {
  return accountIds.filter((id) => id !== sourceId && id !== destinationId);
}

/**
 * The category that has just been created, found by the name that was typed: the server trims it
 * and category names are unique whatever their case. Undefined while the list does not hold it yet.
 */
export function findCreatedCategory<T extends { name: string }>(
  categories: readonly T[],
  typedName: string,
): T | undefined {
  const wanted = typedName.trim().toLowerCase();
  return categories.find((category) => category.name.toLowerCase() === wanted);
}
