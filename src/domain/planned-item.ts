/**
 * Validation of a planned item and the mapping of its stored repetition. Pure functions: no
 * database, no clock. See DOMAIN, entities Planned item and Occurrence override.
 */

import { isCalendarDate } from "./account";
import { messageRef, type MessageRef } from "./message";
import {
  generateOccurrences,
  type AmountMode,
  type OccurrenceOverride,
  type PlannedSchedule,
} from "./occurrences";
import { isValidRepetition, type BusinessDayRule, type Repetition } from "./recurrence";

export type PlannedItemKind = "expense" | "income" | "interest" | "transfer";

const PLANNED_ITEM_KINDS: readonly PlannedItemKind[] = ["expense", "income", "interest", "transfer"];

export const AVERAGE_WINDOWS: readonly number[] = [3, 6, 12];

const DEFAULT_MATCH_WINDOW_DAYS = 5;
// 5%, in basis points so that no percentage is ever a float.
const DEFAULT_MATCH_AMOUNT_TOLERANCE_BP = 500;
const MAX_TOLERANCE_BP = 10_000;
const DEFAULT_AVERAGE_WINDOW = 3;

// Bounds that cover any effective date of a schedule, whatever its overrides move. The lower one
// stays above year 99, which `Date.UTC` would read as 19xx.
const FIRST_DATE = "1000-01-01";
const LAST_DATE = "9999-12-31";

export interface PlannedItemAccount {
  id: number;
  currency: string;
  archived: boolean;
}

export interface PlannedItemCategory {
  id: number;
  archived: boolean;
}

/** What the validation needs to know about the rest of the ledger. */
export interface PlannedItemContext {
  accounts: readonly PlannedItemAccount[];
  categories: readonly PlannedItemCategory[];
}

export interface PlannedItemInput {
  name: string;
  kind: PlannedItemKind;
  accountId: number;
  destinationAccountId?: number | null;
  categoryId?: number | null;
  /** Calendar date, YYYY-MM-DD. */
  startDate: string;
  endDate?: string | null;
  acceptsMultipleTransactions?: boolean;
  provisionLabelFilter?: string | null;
  matchWindowDays?: number;
  matchAmountToleranceBp?: number;
  /** Null: a one-off event on the start date. */
  repetition: Repetition | null;
  businessDayRule?: BusinessDayRule;
  /** Signed integer in minor units. */
  amount: number;
  amountMode?: AmountMode;
  averageWindow?: number;
}

export type ValidPlannedItemInput = Required<PlannedItemInput> & {
  destinationAccountId: number | null;
  categoryId: number | null;
  endDate: string | null;
  provisionLabelFilter: string | null;
};

export type PlannedItemField =
  | "name"
  | "kind"
  | "accountId"
  | "destinationAccountId"
  | "categoryId"
  | "startDate"
  | "endDate"
  | "acceptsMultipleTransactions"
  | "provisionLabelFilter"
  | "matchWindowDays"
  | "matchAmountToleranceBp"
  | "repetition"
  | "amount"
  | "averageWindow";

export class PlannedItemValidationError extends Error {
  constructor(
    readonly field: PlannedItemField,
    /** English text for logs and tests: users read the translation of `ref`. */
    message: string,
    readonly ref: MessageRef,
  ) {
    super(message);
    this.name = "PlannedItemValidationError";
  }
}

function refuse(field: PlannedItemField, message: string, ref: MessageRef): never {
  throw new PlannedItemValidationError(field, message, ref);
}

function accountOf(
  field: "accountId" | "destinationAccountId",
  id: number,
  accounts: readonly PlannedItemAccount[],
): PlannedItemAccount {
  const account = accounts.find((candidate) => candidate.id === id);
  if (account === undefined) {
    refuse(field, `Account ${id} does not exist`, messageRef("plannedItemAccountMissing"));
  }
  if (account.archived) {
    refuse(
      field,
      "A planned item cannot target an archived account",
      messageRef("plannedItemAccountArchived"),
    );
  }
  return account;
}

function assertTransferDestination(
  input: PlannedItemInput,
  source: PlannedItemAccount,
  accounts: readonly PlannedItemAccount[],
): void {
  if (input.destinationAccountId == null) {
    refuse(
      "destinationAccountId",
      "A transfer needs a destination account",
      messageRef("plannedItemTransferDestinationRequired"),
    );
  }
  if (input.destinationAccountId === source.id) {
    refuse(
      "destinationAccountId",
      "A transfer needs two different accounts",
      messageRef("transferSameAccount"),
    );
  }
  const destination = accountOf("destinationAccountId", input.destinationAccountId, accounts);
  if (destination.currency !== source.currency) {
    refuse(
      "destinationAccountId",
      "A transfer cannot cross currencies",
      messageRef("transferCrossCurrency"),
    );
  }
}

function assertAmount(kind: PlannedItemKind, amount: number): void {
  if (!Number.isSafeInteger(amount) || amount === 0) {
    refuse(
      "amount",
      "The amount must be a non-zero integer in minor units",
      messageRef("transactionAmountNonZero"),
    );
  }
  // An expense and a transfer leave the account; an income and interest enter it.
  const leavesAccount = kind === "expense" || kind === "transfer";
  if (leavesAccount === amount < 0) return;
  if (kind === "expense") {
    refuse("amount", "An expense must have a negative amount", messageRef("expenseMustBeNegative"));
  }
  if (kind === "transfer") {
    refuse(
      "amount",
      "The amount of a planned transfer must be negative, as it leaves the account",
      messageRef("plannedItemTransferMustBeNegative"),
    );
  }
  refuse(
    "amount",
    `An ${kind} must have a positive amount`,
    messageRef(kind === "interest" ? "interestMustBePositive" : "incomeMustBePositive"),
  );
}

function assertDates(input: PlannedItemInput): void {
  for (const [field, date] of [
    ["startDate", input.startDate],
    ["endDate", input.endDate],
  ] as const) {
    if (date != null && !isCalendarDate(date)) {
      refuse(
        field,
        `Invalid date "${date}", expected YYYY-MM-DD`,
        messageRef("plannedItemDateInvalid", { date }),
      );
    }
  }
  if (input.endDate == null) return;
  if (input.repetition === null) {
    refuse(
      "endDate",
      "A one-off event has no end date",
      messageRef("plannedItemOneOffHasNoEndDate"),
    );
  }
  if (input.endDate < input.startDate) {
    refuse(
      "endDate",
      "The end date cannot be before the start date",
      messageRef("plannedItemEndBeforeStart"),
    );
  }
}

function assertCategoryAllowed(
  categoryId: number | null | undefined,
  kind: PlannedItemKind,
  categories: readonly PlannedItemCategory[],
): void {
  if (categoryId == null) return;
  if (kind === "transfer") {
    refuse(
      "categoryId",
      "A transfer has no category",
      messageRef("plannedItemTransferHasNoCategory"),
    );
  }
  const category = categories.find((candidate) => candidate.id === categoryId);
  if (category === undefined) {
    refuse("categoryId", `Category ${categoryId} does not exist`, messageRef("plannedItemCategoryMissing"));
  }
  if (category.archived) {
    refuse(
      "categoryId",
      "A planned item cannot use an archived category",
      messageRef("plannedItemCategoryArchived"),
    );
  }
}

function normalizeName(name: string): string {
  const trimmed = name.trim();
  if (trimmed === "") {
    refuse("name", "The name is required", messageRef("plannedItemNameRequired"));
  }
  return trimmed;
}

function assertMatchSettings(matchWindowDays: number, matchAmountToleranceBp: number): void {
  if (!Number.isSafeInteger(matchWindowDays) || matchWindowDays < 0) {
    refuse(
      "matchWindowDays",
      "The matching window must be a whole number of days, 0 or more",
      messageRef("plannedItemMatchWindowInvalid"),
    );
  }
  if (
    !Number.isSafeInteger(matchAmountToleranceBp) ||
    matchAmountToleranceBp < 0 ||
    matchAmountToleranceBp > MAX_TOLERANCE_BP
  ) {
    refuse(
      "matchAmountToleranceBp",
      `The tolerance must be an integer from 0 to ${MAX_TOLERANCE_BP} basis points`,
      messageRef("plannedItemToleranceInvalid", { max: MAX_TOLERANCE_BP }),
    );
  }
}

function normalizeLabelFilter(
  filter: string | null | undefined,
  isProvision: boolean,
): string | null {
  const trimmed = filter?.trim() ?? "";
  if (trimmed === "") return null;
  if (!isProvision) {
    refuse(
      "provisionLabelFilter",
      "A label filter only applies to a provision",
      messageRef("plannedItemLabelFilterNeedsProvision"),
    );
  }
  return trimmed;
}

export function validatePlannedItemInput(
  input: PlannedItemInput,
  context: PlannedItemContext,
): ValidPlannedItemInput {
  const name = normalizeName(input.name);
  if (!PLANNED_ITEM_KINDS.includes(input.kind)) {
    refuse("kind", `Unknown kind "${input.kind}"`, messageRef("plannedItemKindUnknown", { kind: input.kind }));
  }
  const source = accountOf("accountId", input.accountId, context.accounts);
  if (input.kind === "transfer") {
    assertTransferDestination(input, source, context.accounts);
  } else if (input.destinationAccountId != null) {
    refuse(
      "destinationAccountId",
      "Only a transfer has a destination account",
      messageRef("plannedItemDestinationNotAllowed"),
    );
  }
  assertCategoryAllowed(input.categoryId, input.kind, context.categories);
  assertDates(input);
  assertAmount(input.kind, input.amount);
  if (input.repetition !== null && !isValidRepetition(input.repetition)) {
    refuse("repetition", "Invalid repetition", messageRef("plannedItemRepetitionInvalid"));
  }
  const matchWindowDays = input.matchWindowDays ?? DEFAULT_MATCH_WINDOW_DAYS;
  const matchAmountToleranceBp =
    input.matchAmountToleranceBp ?? DEFAULT_MATCH_AMOUNT_TOLERANCE_BP;
  assertMatchSettings(matchWindowDays, matchAmountToleranceBp);
  const averageWindow = input.averageWindow ?? DEFAULT_AVERAGE_WINDOW;
  if (!AVERAGE_WINDOWS.includes(averageWindow)) {
    refuse(
      "averageWindow",
      `The average window must be one of ${AVERAGE_WINDOWS.join(", ")}`,
      messageRef("plannedItemAverageWindowInvalid", { allowed: AVERAGE_WINDOWS.join(", ") }),
    );
  }
  const acceptsMultipleTransactions = input.acceptsMultipleTransactions ?? false;
  // A provision settles a period: without a repetition it has none (owner, 19 Nov 2026).
  if (acceptsMultipleTransactions && input.repetition === null) {
    refuse(
      "acceptsMultipleTransactions",
      "A provision needs a repetition",
      messageRef("plannedItemProvisionNeedsRepetition"),
    );
  }

  return {
    name,
    kind: input.kind,
    accountId: input.accountId,
    destinationAccountId: input.destinationAccountId ?? null,
    categoryId: input.categoryId ?? null,
    startDate: input.startDate,
    endDate: input.endDate ?? null,
    acceptsMultipleTransactions,
    provisionLabelFilter: normalizeLabelFilter(
      input.provisionLabelFilter,
      acceptsMultipleTransactions,
    ),
    matchWindowDays,
    matchAmountToleranceBp,
    repetition: input.repetition,
    businessDayRule: input.businessDayRule ?? "none",
    amount: input.amount,
    amountMode: input.amountMode ?? "fixed",
    averageWindow,
  };
}

/** The fields of an item that change without a new version (amounts and schedules do not). */
export interface PlannedItemDetails {
  name: string;
  categoryId: number | null;
  matchWindowDays: number;
  matchAmountToleranceBp: number;
  provisionLabelFilter: string | null;
}

export function validatePlannedItemDetails(
  details: PlannedItemDetails,
  item: { kind: PlannedItemKind; acceptsMultipleTransactions: boolean },
  categories: readonly PlannedItemCategory[],
): PlannedItemDetails {
  assertCategoryAllowed(details.categoryId, item.kind, categories);
  assertMatchSettings(details.matchWindowDays, details.matchAmountToleranceBp);
  return {
    name: normalizeName(details.name),
    categoryId: details.categoryId,
    matchWindowDays: details.matchWindowDays,
    matchAmountToleranceBp: details.matchAmountToleranceBp,
    provisionLabelFilter: normalizeLabelFilter(
      details.provisionLabelFilter,
      item.acceptsMultipleTransactions,
    ),
  };
}

export type RepetitionKind = Repetition["kind"];

/** A repetition as the database stores it: its kind and, when it has one, its number. */
export interface StoredRepetition {
  kind: RepetitionKind | null;
  value: number | null;
}

export function fromRepetition(repetition: Repetition | null): StoredRepetition {
  if (repetition === null) return { kind: null, value: null };
  switch (repetition.kind) {
    case "monthly_on_day":
      return { kind: repetition.kind, value: repetition.day };
    case "every_n_months":
      return { kind: repetition.kind, value: repetition.months };
    case "every_n_weeks":
      return { kind: repetition.kind, value: repetition.weeks };
    case "monthly_on_last_day":
    case "quarterly":
    case "yearly":
      return { kind: repetition.kind, value: null };
  }
}

export function toRepetition(kind: RepetitionKind | null, value: number | null): Repetition | null {
  if (kind === null) return null;
  switch (kind) {
    case "monthly_on_last_day":
    case "quarterly":
    case "yearly":
      return { kind };
    case "monthly_on_day":
      return { kind, day: requireValue(kind, value) };
    case "every_n_months":
      return { kind, months: requireValue(kind, value) };
    case "every_n_weeks":
      return { kind, weeks: requireValue(kind, value) };
  }
}

// A stored row that lacks its number is corrupted data, not user input: no message reference.
function requireValue(kind: RepetitionKind, value: number | null): number {
  if (value === null) throw new RangeError(`The repetition "${kind}" needs a value`);
  return value;
}

/**
 * Whether an item is over (owner, 19 Nov 2026): cancelled, or bounded by an end date with its last
 * non-cancelled occurrence, on its effective date, before today. An item without end date is never
 * over until it is cancelled or bounded.
 */
export function isPlannedItemOver(
  schedule: PlannedSchedule,
  overrides: readonly OccurrenceOverride[],
  today: string,
): boolean {
  if (schedule.cancelled) return true;
  if (schedule.endDate === null) return false;
  const lastDate = generateOccurrences(
    schedule,
    overrides,
    { from: FIRST_DATE, to: LAST_DATE },
    today,
  )
    .filter((occurrence) => !occurrence.isCancelled)
    .at(-1)?.date;
  // No occurrence left: nothing remains to be settled.
  return lastDate === undefined || lastDate < today;
}
