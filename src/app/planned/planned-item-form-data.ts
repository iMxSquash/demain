import { containsTypedSign, parseUnsignedAmount } from "../../domain/amount-syntax";
import { messageRef, type MessageRef, type Translate } from "../../domain/message";
import { MoneyParseError } from "../../domain/money";
import {
  parseTolerancePercent,
  PlannedItemValidationError,
  type PlannedItemDetails,
  type PlannedItemField,
  type PlannedItemInput,
  type PlannedItemKind,
} from "../../domain/planned-item";
import {
  isValidRepetition,
  type BusinessDayRule,
  type Repetition,
} from "../../domain/recurrence";
import { readAccount, type CurrencyByAccount } from "../transactions/transaction-form-data";

/** The order of the type segments (DESIGN section 17): Out, In, Move, Interest. */
export const PLANNED_ITEM_FORM_KINDS = ["expense", "income", "transfer", "interest"] as const;

export const REPETITION_CHOICES = [
  "once",
  "monthly_on_day",
  "monthly_on_last_day",
  "every_n_months",
  "quarterly",
  "yearly",
  "every_n_weeks",
] as const;
export type RepetitionChoice = (typeof REPETITION_CHOICES)[number];

/** The repetitions that need a number next to them, and what the number counts. */
export const REPETITION_NUMBER_UNIT: Partial<Record<RepetitionChoice, "day" | "months" | "weeks">> = {
  monthly_on_day: "day",
  every_n_months: "months",
  every_n_weeks: "weeks",
};

export const BUSINESS_DAY_RULES: readonly BusinessDayRule[] = ["none", "previous", "next"];

const WHOLE_NUMBER = /^\d+$/;
// Refused by `isValidRepetition` for every repetition that counts (a day from 1, months and weeks
// from 1), so that a missing or unreadable number is refused with the same rule as a zero.
const NO_NUMBER = 0;

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
  repetition: "repetition",
  amount: "amount",
  matchWindowDays: "matchWindowDays",
  matchAmountToleranceBp: "matchTolerancePercent",
  // Provisions and rolling averages have no control yet (#163, #164).
  acceptsMultipleTransactions: undefined,
  provisionLabelFilter: undefined,
  averageWindow: undefined,
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

function wholeNumber(text: string): number | null {
  const trimmed = text.trim();
  return WHOLE_NUMBER.test(trimmed) ? Number(trimmed) : null;
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
  if (choice === "once") return { repetition: null };
  const candidate = candidateRepetition(choice, wholeNumber(valueText) ?? NO_NUMBER);
  if (candidate === null) {
    return { field: "repetition", ref: messageRef("plannedItemRepetitionInvalid") };
  }
  if (!isValidRepetition(candidate)) {
    return { field: "repetitionValue", ref: messageRef("plannedItemRepetitionNumberInvalid") };
  }
  return { repetition: candidate };
}

type MatchResult =
  | { windowDays: number; toleranceBp: number }
  | { field: "matchWindowDays" | "matchTolerancePercent"; ref: MessageRef };

function readMatchSettings(windowText: string, toleranceText: string): MatchResult {
  const windowDays = wholeNumber(windowText);
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
  if (kind === "transfer") {
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
  const category = kind === "transfer" ? { id: null } : readCategoryId(values.categoryId);
  if ("ref" in category) return fail("categoryId", category.ref);

  const repetition = readRepetition(values.repetition, values.repetitionValue);
  if ("ref" in repetition) return fail(repetition.field, repetition.ref);

  const { businessDayRule } = values;
  if (!isBusinessDayRule(businessDayRule)) {
    return fail("businessDayRule", messageRef("plannedItemBusinessDayRuleInvalid"));
  }

  const match = readMatchSettings(values.matchWindowDays, values.matchTolerancePercent);
  if ("ref" in match) return fail(match.field, match.ref);

  const endDate = values.endDate.trim();
  const leavesAccount = kind === "expense" || kind === "transfer";
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
      // `0 - x` keeps a zero amount at +0, which the domain then refuses.
      amount: leavesAccount ? 0 - amount.value : amount.value,
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
