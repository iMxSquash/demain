import {
  containsTypedSign,
  parseUnsignedAmount,
  parseWholeNumber,
} from "../../domain/amount-syntax";
import { messageRef, type MessageRef, type Translate } from "../../domain/message";
import { MoneyParseError } from "../../domain/money";
import type { AmountMode } from "../../domain/occurrences";
import {
  AMOUNT_MODES,
  AVERAGE_WINDOWS,
  parseTolerancePercent,
  PlannedItemValidationError,
  type PlannedItemDetails,
  type PlannedItemField,
  type PlannedItemInput,
  type PlannedItemKind,
  type PlannedItemVersionInput,
} from "../../domain/planned-item";
import {
  isValidRepetition,
  type BusinessDayRule,
  type Repetition,
} from "../../domain/recurrence";
import { readAccount, type CurrencyByAccount } from "../transactions/transaction-form-data";

/** The order of the type segments (DESIGN section 17): Out, In, Move, Interest. */
export const DEFAULT_FORM_KIND = "expense";
export const TRANSFER_KIND = "transfer";
export const PLANNED_ITEM_FORM_KINDS = [DEFAULT_FORM_KIND, "income", TRANSFER_KIND, "interest"] as const;

/** The choice of a one-off event: it has no repetition and no end date. */
export const ONCE = "once";
export const DEFAULT_REPETITION = "monthly_on_day";

export const REPETITION_CHOICES = [
  ONCE,
  DEFAULT_REPETITION,
  "monthly_on_last_day",
  "every_n_months",
  "quarterly",
  "yearly",
  "every_n_weeks",
] as const;
export type RepetitionChoice = (typeof REPETITION_CHOICES)[number];

// The server is the authority on what a repetition means: an unknown value coming back from it
// falls back to the default instead of being refused here.
export function repetitionChoiceOf(value: string): RepetitionChoice {
  return REPETITION_CHOICES.find((choice) => choice === value) ?? DEFAULT_REPETITION;
}

/** The repetitions that need a number next to them, and what the number counts. */
export const REPETITION_NUMBER_UNIT: Partial<Record<RepetitionChoice, "day" | "months" | "weeks">> = {
  monthly_on_day: "day",
  every_n_months: "months",
  every_n_weeks: "weeks",
};

export const DEFAULT_AMOUNT_MODE: AmountMode = "fixed";
export const ROLLING_AVERAGE_MODE: AmountMode = "rolling_average";

export const BUSINESS_DAY_RULES: readonly BusinessDayRule[] = ["none", "previous", "next"];

// Refused by `isValidRepetition` for every repetition that counts (a day from 1, months and weeks
// from 1), so that a missing or unreadable number is refused with the same rule as a zero.
const UNREADABLE_COUNT = 0;

export interface PlannedItemFormValues {
  name: string;
  kind: string;
  accountId: string;
  /** Account id as text, read for a transfer only. */
  destinationAccountId: string;
  /** Category id as text, blank means none. */
  categoryId: string;
  startDate: string;
  /** Blank means no end date. */
  endDate: string;
  repetition: string;
  /** The day, the months or the weeks, read only when the repetition counts something. */
  repetitionValue: string;
  businessDayRule: string;
  /** Unsigned: the kind decides the direction. */
  amount: string;
  /** "fixed" or "rolling_average"; blank means fixed. */
  amountMode: string;
  /** Occurrences averaged, as text, read in rolling average mode only. */
  averageWindow: string;
  /** Days, as text. */
  matchWindowDays: string;
  /** Percent, as text ("5", "2,5"). */
  matchTolerancePercent: string;
}

export type PlannedItemFormField = keyof PlannedItemFormValues;

export interface PlannedItemFormState {
  field?: PlannedItemFormField;
  message: string;
  /** What the user typed: React resets the form after an action, so it is sent back. */
  values: PlannedItemFormValues;
}

export type ParsedPlannedItemForm =
  | { ok: true; input: PlannedItemInput }
  | { ok: false; error: PlannedItemFormState };

export type PlannedItemDetailsFormValues = Pick<
  PlannedItemFormValues,
  "name" | "categoryId" | "matchWindowDays" | "matchTolerancePercent"
>;

export type PlannedItemDetailsFormField = keyof PlannedItemDetailsFormValues;

export interface PlannedItemDetailsFormState {
  field?: PlannedItemDetailsFormField;
  message: string;
  values: PlannedItemDetailsFormValues;
}

export type ParsedPlannedItemDetailsForm =
  | { ok: true; details: PlannedItemDetails }
  | { ok: false; error: PlannedItemDetailsFormState };

/** The control that shows a refusal of the domain, when the form has one for that field. */
const FORM_FIELD_OF: Record<PlannedItemField, PlannedItemFormField | undefined> = {
  name: "name",
  kind: "kind",
  accountId: "accountId",
  destinationAccountId: "destinationAccountId",
  categoryId: "categoryId",
  startDate: "startDate",
  endDate: "endDate",
  // The version form owns its own date control: the creation form has none.
  effectiveFrom: undefined,
  repetition: "repetition",
  amount: "amount",
  matchWindowDays: "matchWindowDays",
  matchAmountToleranceBp: "matchTolerancePercent",
  // Provisions have no control yet (#164).
  acceptsMultipleTransactions: undefined,
  provisionLabelFilter: undefined,
  amountMode: "amountMode",
  averageWindow: "averageWindow",
};

export function formFieldOf(field: PlannedItemField): PlannedItemFormField | undefined {
  return FORM_FIELD_OF[field];
}

function readText(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

export function readSubmittedValues(formData: FormData): PlannedItemFormValues {
  return {
    name: readText(formData, "name"),
    kind: readText(formData, "kind"),
    accountId: readText(formData, "accountId"),
    destinationAccountId: readText(formData, "destinationAccountId"),
    categoryId: readText(formData, "categoryId"),
    startDate: readText(formData, "startDate"),
    endDate: readText(formData, "endDate"),
    repetition: readText(formData, "repetition"),
    repetitionValue: readText(formData, "repetitionValue"),
    businessDayRule: readText(formData, "businessDayRule"),
    amount: readText(formData, "amount"),
    amountMode: readText(formData, "amountMode"),
    averageWindow: readText(formData, "averageWindow"),
    matchWindowDays: readText(formData, "matchWindowDays"),
    matchTolerancePercent: readText(formData, "matchTolerancePercent"),
  };
}

export function readSubmittedDetails(formData: FormData): PlannedItemDetailsFormValues {
  return {
    name: readText(formData, "name"),
    categoryId: readText(formData, "categoryId"),
    matchWindowDays: readText(formData, "matchWindowDays"),
    matchTolerancePercent: readText(formData, "matchTolerancePercent"),
  };
}

type Refusal = { ref: MessageRef };

function isKind(value: string): value is PlannedItemKind {
  return (PLANNED_ITEM_FORM_KINDS as readonly string[]).includes(value);
}

function isBusinessDayRule(value: string): value is BusinessDayRule {
  return BUSINESS_DAY_RULES.some((rule) => rule === value);
}

function readAmount(text: string, currency: string): { value: number } | Refusal {
  // The sign gets its own message: the kind, not the text, gives the direction.
  if (containsTypedSign(text)) return { ref: messageRef("amountUnsigned") };
  try {
    return { value: parseUnsignedAmount(text, currency) };
  } catch (error) {
    if (error instanceof MoneyParseError) return { ref: error.ref };
    throw error;
  }
}

// The kind decides the direction. `0 - x` keeps a zero amount at +0, which the domain then refuses.
function signedAmountOf(kind: PlannedItemKind, unsignedMinorUnits: number): number {
  const leavesAccount = kind === DEFAULT_FORM_KIND || kind === TRANSFER_KIND;
  return leavesAccount ? 0 - unsignedMinorUnits : unsignedMinorUnits;
}

function readCategoryId(text: string): { id: number | null } | Refusal {
  if (text.trim() === "") return { id: null };
  const id = Number(text);
  return Number.isSafeInteger(id) ? { id } : { ref: messageRef("categoryUnknown") };
}

function candidateRepetition(choice: string, count: number): Repetition | null {
  switch (choice) {
    case "monthly_on_day":
      return { kind: choice, day: count };
    case "monthly_on_last_day":
    case "quarterly":
    case "yearly":
      return { kind: choice };
    case "every_n_months":
      return { kind: choice, months: count };
    case "every_n_weeks":
      return { kind: choice, weeks: count };
    default:
      return null;
  }
}

type RepetitionResult =
  | { repetition: Repetition | null }
  | { field: "repetition" | "repetitionValue"; ref: MessageRef };

function readRepetition(choice: string, valueText: string): RepetitionResult {
  if (choice === ONCE) return { repetition: null };
  const candidate = candidateRepetition(choice, parseWholeNumber(valueText) ?? UNREADABLE_COUNT);
  if (candidate === null) {
    return { field: "repetition", ref: messageRef("plannedItemRepetitionInvalid") };
  }
  if (!isValidRepetition(candidate)) {
    return { field: "repetitionValue", ref: messageRef("plannedItemRepetitionNumberInvalid") };
  }
  return { repetition: candidate };
}

type AmountModeResult =
  | { amountMode: AmountMode; averageWindow: number | undefined }
  | { field: "amountMode" | "averageWindow"; ref: MessageRef };

// The window only exists in rolling average mode: a fixed item drops whatever was typed for it.
function readAmountMode(modeText: string, windowText: string): AmountModeResult {
  const mode = modeText.trim() === "" ? DEFAULT_AMOUNT_MODE : modeText;
  const amountMode = AMOUNT_MODES.find((candidate) => candidate === mode);
  if (amountMode === undefined) {
    return { field: "amountMode", ref: messageRef("plannedItemAmountModeInvalid") };
  }
  if (amountMode !== ROLLING_AVERAGE_MODE) return { amountMode, averageWindow: undefined };
  const averageWindow = parseWholeNumber(windowText);
  if (averageWindow === null || !AVERAGE_WINDOWS.includes(averageWindow)) {
    return {
      field: "averageWindow",
      ref: messageRef("plannedItemAverageWindowInvalid", { allowed: AVERAGE_WINDOWS.join(", ") }),
    };
  }
  return { amountMode, averageWindow };
}

type MatchResult =
  | { windowDays: number; toleranceBp: number }
  | { field: "matchWindowDays" | "matchTolerancePercent"; ref: MessageRef };

function readMatchSettings(windowText: string, toleranceText: string): MatchResult {
  const windowDays = parseWholeNumber(windowText);
  if (windowDays === null) {
    return { field: "matchWindowDays", ref: messageRef("plannedItemMatchWindowInvalid") };
  }
  try {
    return { windowDays, toleranceBp: parseTolerancePercent(toleranceText) };
  } catch (error) {
    if (error instanceof PlannedItemValidationError) {
      return { field: "matchTolerancePercent", ref: error.ref };
    }
    throw error;
  }
}

/**
 * Converts submitted text to a typed input. The currency of the amount comes from the account the
 * server knows, never from the browser. Amounts and the tolerance never go through a float. What
 * does not apply to the chosen kind or repetition is dropped here, as the domain would refuse it.
 */
export function parsePlannedItemForm(
  formData: FormData,
  currencies: CurrencyByAccount,
  translate: Translate,
): ParsedPlannedItemForm {
  const values = readSubmittedValues(formData);
  const fail = (field: PlannedItemFormField, ref: MessageRef) => ({
    ok: false as const,
    error: { field, message: translate(ref), values },
  });

  const { kind } = values;
  if (!isKind(kind)) {
    return fail("kind", messageRef("plannedItemKindUnknown", { kind }));
  }
  const account = readAccount(values.accountId, currencies);
  if (account === null) return fail("accountId", messageRef("accountUnknown"));

  let destinationAccountId: number | null = null;
  if (kind === TRANSFER_KIND) {
    if (values.destinationAccountId.trim() === "") {
      return fail("destinationAccountId", messageRef("plannedItemTransferDestinationRequired"));
    }
    destinationAccountId = Number(values.destinationAccountId);
    if (!Number.isSafeInteger(destinationAccountId)) {
      return fail("destinationAccountId", messageRef("transferDestinationUnknown"));
    }
  }

  const amount = readAmount(values.amount, account.currency);
  if ("ref" in amount) return fail("amount", amount.ref);

  // A transfer has no category: whatever was typed before switching to it is dropped.
  const category = kind === TRANSFER_KIND ? { id: null } : readCategoryId(values.categoryId);
  if ("ref" in category) return fail("categoryId", category.ref);

  const repetition = readRepetition(values.repetition, values.repetitionValue);
  if ("ref" in repetition) return fail(repetition.field, repetition.ref);

  const { businessDayRule } = values;
  if (!isBusinessDayRule(businessDayRule)) {
    return fail("businessDayRule", messageRef("plannedItemBusinessDayRuleInvalid"));
  }

  const mode = readAmountMode(values.amountMode, values.averageWindow);
  if ("ref" in mode) return fail(mode.field, mode.ref);

  const match = readMatchSettings(values.matchWindowDays, values.matchTolerancePercent);
  if ("ref" in match) return fail(match.field, match.ref);

  const endDate = values.endDate.trim();
  return {
    ok: true,
    input: {
      name: values.name,
      kind,
      accountId: account.id,
      destinationAccountId,
      categoryId: category.id,
      startDate: values.startDate,
      // A one-off event has no end date: the field may still hold one from before the switch.
      endDate: repetition.repetition === null || endDate === "" ? null : endDate,
      repetition: repetition.repetition,
      businessDayRule,
      amount: signedAmountOf(kind, amount.value),
      amountMode: mode.amountMode,
      averageWindow: mode.averageWindow,
      matchWindowDays: match.windowDays,
      matchAmountToleranceBp: match.toleranceBp,
    },
  };
}

/** The edit form changes the four details the domain allows without a version. */
export function parsePlannedItemDetailsForm(
  formData: FormData,
  provisionLabelFilter: string | null,
  translate: Translate,
): ParsedPlannedItemDetailsForm {
  const values = readSubmittedDetails(formData);
  const fail = (field: PlannedItemDetailsFormField, ref: MessageRef) => ({
    ok: false as const,
    error: { field, message: translate(ref), values },
  });

  const category = readCategoryId(values.categoryId);
  if ("ref" in category) return fail("categoryId", category.ref);

  const match = readMatchSettings(values.matchWindowDays, values.matchTolerancePercent);
  if ("ref" in match) return fail(match.field, match.ref);

  return {
    ok: true,
    details: {
      name: values.name,
      categoryId: category.id,
      matchWindowDays: match.windowDays,
      matchAmountToleranceBp: match.toleranceBp,
      provisionLabelFilter,
    },
  };
}

export type PlannedItemVersionFormValues = Pick<
  PlannedItemFormValues,
  "repetition" | "repetitionValue" | "businessDayRule" | "amount" | "amountMode" | "averageWindow"
> & { effectiveFrom: string };

export type PlannedItemVersionFormField = keyof PlannedItemVersionFormValues;

export interface PlannedItemVersionFormState {
  field?: PlannedItemVersionFormField;
  message: string;
  values: PlannedItemVersionFormValues;
}

/** What the version form needs to sign and scale the amount. */
interface PlannedItemVersionFormContext {
  kind: PlannedItemKind;
  currency: string;
}

type ParsedPlannedItemVersionForm =
  | { ok: true; input: PlannedItemVersionInput }
  | { ok: false; error: PlannedItemVersionFormState };

export interface PlannedItemEndDateFormValues {
  /** Blank clears the end date. */
  endDate: string;
}

export interface PlannedItemEndDateFormState {
  field?: "endDate";
  message: string;
  values: PlannedItemEndDateFormValues;
}

type ParsedPlannedItemEndDateForm =
  | { ok: true; endDate: string | null }
  | { ok: false; error: PlannedItemEndDateFormState };

export function readSubmittedVersion(formData: FormData): PlannedItemVersionFormValues {
  return {
    effectiveFrom: readText(formData, "effectiveFrom"),
    repetition: readText(formData, "repetition"),
    repetitionValue: readText(formData, "repetitionValue"),
    businessDayRule: readText(formData, "businessDayRule"),
    amount: readText(formData, "amount"),
    amountMode: readText(formData, "amountMode"),
    averageWindow: readText(formData, "averageWindow"),
  };
}

/** The version form changes the schedule and the amount from a date; the kind gives the sign. */
export function parsePlannedItemVersionForm(
  formData: FormData,
  context: PlannedItemVersionFormContext,
  translate: Translate,
): ParsedPlannedItemVersionForm {
  const values = readSubmittedVersion(formData);
  const fail = (field: PlannedItemVersionFormField, ref: MessageRef) => ({
    ok: false as const,
    error: { field, message: translate(ref), values },
  });

  const amount = readAmount(values.amount, context.currency);
  if ("ref" in amount) return fail("amount", amount.ref);

  const repetition = readRepetition(values.repetition, values.repetitionValue);
  if ("ref" in repetition) return fail(repetition.field, repetition.ref);

  const { businessDayRule } = values;
  if (!isBusinessDayRule(businessDayRule)) {
    return fail("businessDayRule", messageRef("plannedItemBusinessDayRuleInvalid"));
  }

  const mode = readAmountMode(values.amountMode, values.averageWindow);
  if ("ref" in mode) return fail(mode.field, mode.ref);

  return {
    ok: true,
    input: {
      effectiveFrom: values.effectiveFrom,
      repetition: repetition.repetition,
      businessDayRule,
      amount: signedAmountOf(context.kind, amount.value),
      amountMode: mode.amountMode,
      averageWindow: mode.averageWindow,
    },
  };
}

export function readSubmittedEndDate(formData: FormData): PlannedItemEndDateFormValues {
  return { endDate: readText(formData, "endDate") };
}

export function parsePlannedItemEndDateForm(formData: FormData): ParsedPlannedItemEndDateForm {
  const endDate = readSubmittedEndDate(formData).endDate.trim();
  return { ok: true, endDate: endDate === "" ? null : endDate };
}
