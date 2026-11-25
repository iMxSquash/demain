/**
 * Validation of a planned item and the mapping of its stored repetition. Pure functions: no
 * database, no clock. See DOMAIN, entities Planned item and Occurrence override.
 */

import { isCalendarDate } from "./account";
import { addDays } from "./calendar-date";
import { messageRef, type MessageRef } from "./message";
import {
  generateOccurrences,
  isNominalDate,
  type AmountMode,
  type OccurrenceOverride,
  type OverrideStatus,
  type PlannedSchedule,
  type PlannedVersion,
} from "./occurrences";
import { isValidRepetition, type BusinessDayRule, type Repetition } from "./recurrence";

export type PlannedItemKind = "expense" | "income" | "interest" | "transfer";

const PLANNED_ITEM_KINDS: readonly PlannedItemKind[] = ["expense", "income", "interest", "transfer"];

export const AMOUNT_MODES: readonly AmountMode[] = ["fixed", "rolling_average"];

export const AVERAGE_WINDOWS: readonly number[] = [3, 6, 12];

export const DEFAULT_MATCH_WINDOW_DAYS = 5;
// 5%, in basis points so that no percentage is ever a float.
export const DEFAULT_MATCH_AMOUNT_TOLERANCE_BP = 500;
const MAX_TOLERANCE_BP = 10_000;
export const DEFAULT_AVERAGE_WINDOW = 3;

// Covers any effective date of a schedule, whatever its overrides move.
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
  | "effectiveFrom"
  | "acceptsMultipleTransactions"
  | "provisionLabelFilter"
  | "matchWindowDays"
  | "matchAmountToleranceBp"
  | "repetition"
  | "amount"
  | "amountMode"
  | "nominalDate"
  | "overrideDate"
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
  assertCalendarDate("startDate", input.startDate);
  if (input.endDate != null) assertCalendarDate("endDate", input.endDate);
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

function assertAmountMode(amountMode: AmountMode): void {
  if (AMOUNT_MODES.includes(amountMode)) return;
  refuse(
    "amountMode",
    `The amount mode must be one of ${AMOUNT_MODES.join(", ")}`,
    messageRef("plannedItemAmountModeInvalid"),
  );
}

function assertAverageWindow(averageWindow: number): void {
  if (AVERAGE_WINDOWS.includes(averageWindow)) return;
  refuse(
    "averageWindow",
    `The average window must be one of ${AVERAGE_WINDOWS.join(", ")}`,
    messageRef("plannedItemAverageWindowInvalid", { allowed: AVERAGE_WINDOWS.join(", ") }),
  );
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
  const amountMode = input.amountMode ?? "fixed";
  assertAmountMode(amountMode);
  const averageWindow = input.averageWindow ?? DEFAULT_AVERAGE_WINDOW;
  assertAverageWindow(averageWindow);
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
    amountMode,
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

const BASIS_POINTS_PER_PERCENT = 100;
const PERCENT_DECIMALS = 2;
// Digits, then at most one comma or point and up to two decimals.
const TOLERANCE_PERCENT = /^(\d+)(?:[.,](\d{1,2}))?$/;
const TOLERANCE_PERCENT_DRAFT = /^(\d{0,3})(?:[.,](\d{0,2}))?$/;
const MAX_TOLERANCE_PERCENT = MAX_TOLERANCE_BP / BASIS_POINTS_PER_PERCENT;

/**
 * Reads a tolerance typed as a percentage ("5", "2,5", "2.5") into basis points (500, 250, 250)
 * by string handling, so that no percentage is ever a float (DOMAIN invariant 1). At most two
 * decimals, from 0 to 100.
 */
export function parseTolerancePercent(text: string): number {
  const match = TOLERANCE_PERCENT.exec(text.trim());
  const [, whole = "", decimals = ""] = match ?? [];
  const basisPoints =
    Number(whole) * BASIS_POINTS_PER_PERCENT + Number(decimals.padEnd(PERCENT_DECIMALS, "0"));
  if (match !== null && basisPoints <= MAX_TOLERANCE_BP) return basisPoints;
  return refuse(
    "matchAmountToleranceBp",
    `The tolerance "${text}" is not a percentage from 0 to 100 with two decimals at most`,
    messageRef("plannedItemTolerancePercentInvalid"),
  );
}

/**
 * Whether `text` can still become a valid tolerance by typing more: digits, then at most one comma
 * or point and two decimals, never above 100. Incomplete values ("2,") pass, so that "2,5" can be
 * typed. The browser filters on it while typing, with the rule `parseTolerancePercent` applies.
 */
export function isTolerancePercentDraft(text: string): boolean {
  const match = TOLERANCE_PERCENT_DRAFT.exec(text);
  if (match === null) return false;
  const [, whole = "", decimals = ""] = match;
  const percent = Number(whole);
  return percent < MAX_TOLERANCE_PERCENT || (percent === MAX_TOLERANCE_PERCENT && /^0*$/.test(decimals));
}

/** The inverse of `parseTolerancePercent`, to pre-fill a field: 500 is "5", 250 is "2.5". */
export function formatTolerancePercent(basisPoints: number): string {
  const whole = Math.floor(basisPoints / BASIS_POINTS_PER_PERCENT);
  const decimals = String(basisPoints % BASIS_POINTS_PER_PERCENT)
    .padStart(PERCENT_DECIMALS, "0")
    .replace(/0+$/, "");
  return decimals === "" ? String(whole) : `${whole}.${decimals}`;
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
  // Only what is left from today matters: an occurrence moved by an override is counted by its
  // effective date.
  return !generateOccurrences(schedule, overrides, { from: today, to: LAST_DATE }, today).some(
    (occurrence) => !occurrence.isCancelled,
  );
}

export interface PlannedItemVersionInput {
  /** Calendar date, YYYY-MM-DD. */
  effectiveFrom: string;
  repetition: Repetition | null;
  /** Default: the rule of the version in effect at `effectiveFrom`. */
  businessDayRule?: BusinessDayRule;
  /** Signed integer in minor units. */
  amount: number;
  /** Default: the mode of the version in effect at `effectiveFrom`. */
  amountMode?: AmountMode;
  /** Default: the window of the version in effect at `effectiveFrom`. */
  averageWindow?: number;
}

interface VersionChangeContext extends BlockingOccurrences {
  item: PlannedSchedule & { kind: PlannedItemKind };
  accountArchived: boolean;
}

interface ValidVersionInput {
  effectiveFrom: string;
  repetition: Repetition | null;
  businessDayRule: BusinessDayRule;
  amount: number;
  amountMode: AmountMode;
  averageWindow: number;
  /** A version already has this effective date: the new one takes its place. */
  replaces: boolean;
}

/** The last version effective on or before `date`, else the first. */
export function versionInEffectAt<V extends { effectiveFrom: string }>(
  versions: readonly V[],
  date: string,
): V {
  const first = versions[0];
  if (first === undefined) throw new RangeError("A planned item has at least one version");
  return versions.findLast((version) => version.effectiveFrom <= date) ?? first;
}

export function isOneOff(versions: readonly PlannedVersion[]): boolean {
  return versions.every((version) => version.repetition === null);
}

function assertCalendarDate(
  field: "startDate" | "endDate" | "effectiveFrom" | "nominalDate" | "overrideDate",
  date: string,
): void {
  if (isCalendarDate(date)) return;
  refuse(
    field,
    `Invalid date "${date}", expected YYYY-MM-DD`,
    messageRef("plannedItemDateInvalid", { date }),
  );
}

function assertVersionDateInRange(effectiveFrom: string, item: VersionChangeContext["item"]): void {
  if (effectiveFrom < item.startDate) {
    refuse(
      "effectiveFrom",
      "A version cannot take effect before the start date",
      messageRef("plannedItemVersionBeforeStart", { date: item.startDate }),
    );
  }
  if (item.endDate !== null && effectiveFrom > item.endDate) {
    refuse(
      "effectiveFrom",
      "A version cannot take effect after the end date",
      messageRef("plannedItemVersionAfterEnd", { date: item.endDate }),
    );
  }
}

interface BlockingOccurrences {
  /** Nominal dates of the occurrences settled by a transaction, partial provisions included. */
  settledNominalDates: readonly string[];
  overrides: readonly OccurrenceOverride[];
}

// A settled or overridden occurrence keeps the date, amount and link it was given: a change that
// would reach back over one, or stop the schedule before it, is refused so that history is never
// rewritten or hidden.
function latestBlockingNominalDate(context: BlockingOccurrences): string | null {
  return [...context.settledNominalDates, ...context.overrides.map((override) => override.nominalDate)].sort().at(-1) ?? null;
}

function assertNoBlockingDateFrom(effectiveFrom: string, context: VersionChangeContext): void {
  const latestBlocking = latestBlockingNominalDate(context);
  if (latestBlocking === null || latestBlocking < effectiveFrom) return;
  const earliestAllowed = addDays(latestBlocking, 1);
  refuse(
    "effectiveFrom",
    `An occurrence from this date on is already settled or modified: the earliest date allowed is ${earliestAllowed}`,
    messageRef("plannedItemVersionTooEarly", { date: earliestAllowed }),
  );
}

// The end date is inclusive and an occurrence is identified by its nominal date: ending on that date
// keeps it, whatever date an override moved it to (owner, Q2 of #174 and #204).
function assertNoBlockingDateAfter(endDate: string, context: BlockingOccurrences): void {
  const latestBlocking = latestBlockingNominalDate(context);
  if (latestBlocking === null || latestBlocking <= endDate) return;
  refuse(
    "endDate",
    `An occurrence after this date is already settled or modified: the earliest end date allowed is ${latestBlocking}`,
    messageRef("plannedItemEndBeforeChangedOccurrence", { date: latestBlocking }),
  );
}

export function validatePlannedItemVersion(
  input: PlannedItemVersionInput,
  context: VersionChangeContext,
): ValidVersionInput {
  const { item } = context;
  if (item.cancelled) {
    refuse(
      "effectiveFrom",
      "A cancelled planned item cannot get a new version",
      messageRef("plannedItemVersionOnCancelled"),
    );
  }
  if (context.accountArchived) {
    refuse(
      "effectiveFrom",
      "A planned item whose account is archived cannot get a new version",
      messageRef("plannedItemAccountArchived"),
    );
  }
  assertCalendarDate("effectiveFrom", input.effectiveFrom);
  assertVersionDateInRange(input.effectiveFrom, item);
  assertAmount(item.kind, input.amount);
  if (input.repetition !== null) {
    if (!isValidRepetition(input.repetition)) {
      refuse("repetition", "Invalid repetition", messageRef("plannedItemRepetitionInvalid"));
    }
    if (isOneOff(item.versions)) {
      refuse(
        "repetition",
        "A one-off event cannot repeat",
        messageRef("plannedItemVersionRepeatsOneOff"),
      );
    }
  }
  assertNoBlockingDateFrom(input.effectiveFrom, context);

  const inEffect = versionInEffectAt(item.versions, input.effectiveFrom);
  const amountMode = input.amountMode ?? inEffect.amountMode;
  assertAmountMode(amountMode);
  const averageWindow = input.averageWindow ?? inEffect.averageWindow;
  assertAverageWindow(averageWindow);
  return {
    effectiveFrom: input.effectiveFrom,
    repetition: input.repetition,
    businessDayRule: input.businessDayRule ?? inEffect.businessDayRule,
    amount: input.amount,
    amountMode,
    averageWindow,
    replaces: item.versions.some((version) => version.effectiveFrom === input.effectiveFrom),
  };
}

interface EndDateChangeContext extends BlockingOccurrences {
  item: { startDate: string; versions: readonly PlannedVersion[] };
}

export function validatePlannedItemEndDate(endDate: string | null, context: EndDateChangeContext): string | null {
  if (endDate === null) return null;
  const { item } = context;
  assertCalendarDate("endDate", endDate);
  if (endDate < item.startDate) {
    refuse(
      "endDate",
      "The end date cannot be before the start date",
      messageRef("plannedItemEndBeforeStart"),
    );
  }
  if (isOneOff(item.versions)) {
    refuse("endDate", "A one-off event has no end date", messageRef("plannedItemOneOffHasNoEndDate"));
  }
  assertNoBlockingDateAfter(endDate, context);
  return endDate;
}

export interface OccurrenceOverrideInput {
  nominalDate: string;
  status: OverrideStatus;
  overrideDate: string | null;
  overrideAmount: number | null;
}

export interface OccurrenceOverrideContext {
  item: PlannedSchedule & { kind: PlannedItemKind };
  accountArchived: boolean;
  /** Nominal dates of the occurrences linked to a transaction, partial provisions included. */
  settledNominalDates: readonly string[];
}

// A linked occurrence keeps what its transaction settled: it is unlinked first (owner, Q1 of #174),
// whether it is fully settled or a partial provision.
function assertOccurrenceEditable(nominalDate: string, context: OccurrenceOverrideContext): void {
  if (context.item.cancelled) {
    refuse(
      "nominalDate",
      "The occurrences of a cancelled planned item cannot change",
      messageRef("plannedItemOccurrenceOnCancelled"),
    );
  }
  if (context.accountArchived) {
    refuse(
      "nominalDate",
      "The occurrences of a planned item whose account is archived cannot change",
      messageRef("plannedItemOccurrenceAccountArchived"),
    );
  }
  if (context.settledNominalDates.includes(nominalDate)) {
    refuse(
      "nominalDate",
      "This occurrence is linked to a transaction: unlink it first",
      messageRef("plannedItemOccurrenceLinked"),
    );
  }
}

/**
 * Validates the skip, move or amount change of one occurrence, identified by its nominal date. The
 * new date may fall outside the span of its version or after the end date (owner, Q2 of #174).
 */
export function validateOccurrenceOverride(
  input: OccurrenceOverrideInput,
  context: OccurrenceOverrideContext,
): OccurrenceOverride {
  assertOccurrenceEditable(input.nominalDate, context);
  assertCalendarDate("nominalDate", input.nominalDate);
  if (!isNominalDate(context.item, input.nominalDate)) {
    refuse(
      "nominalDate",
      `The schedule has no occurrence on ${input.nominalDate}`,
      messageRef("plannedItemOccurrenceNotProduced", { date: input.nominalDate }),
    );
  }
  if (input.status === "cancelled") return { ...input, overrideDate: null, overrideAmount: null };
  if (input.overrideDate === null && input.overrideAmount === null) {
    refuse(
      "overrideDate",
      "A modified occurrence needs a new date or a new amount",
      messageRef("plannedItemOverrideEmpty"),
    );
  }
  if (input.overrideDate !== null) assertCalendarDate("overrideDate", input.overrideDate);
  if (input.overrideAmount !== null) assertAmount(context.item.kind, input.overrideAmount);
  return input;
}

/** Validates giving an occurrence back its computed date and amount. */
export function validateOccurrenceOverrideRemoval(
  nominalDate: string,
  context: OccurrenceOverrideContext,
): void {
  assertOccurrenceEditable(nominalDate, context);
}
