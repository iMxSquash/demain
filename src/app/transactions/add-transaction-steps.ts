/**
 * The pure logic of the three-step add-transaction flow on a phone (DESIGN section 10): which
 * step comes next, which way the motion goes, what the keypad types, what each step requires
 * and what the recap shows. No clock, database, network or React: strings for the user come
 * from the caller as message references or as plain data to translate.
 */

import { checkAmountSyntax, isAmountDraft, parseUnsignedAmount } from "../../domain/amount-syntax";
import { messageRef, type MessageRef } from "../../domain/message";
import { MoneyParseError } from "../../domain/money";
import { isCalendarDate } from "../../domain/account";
import { WIDE_MIN_WIDTH } from "./add-transaction-layout";
import { formatTypedAmount } from "./typed-amount";

export const STEPS = [1, 2, 3] as const;
export type Step = (typeof STEPS)[number];
export const STEP_COUNT = STEPS.length;

const FIRST_STEP: Step = 1;
const LAST_STEP: Step = 3;
const TRANSFER = "transfer";

export function nextStep(step: Step): Step {
  return step === LAST_STEP ? step : ((step + 1) as Step);
}

export function previousStep(step: Step): Step {
  return step === FIRST_STEP ? step : ((step - 1) as Step);
}

export function canGoBack(step: Step): boolean {
  return step > FIRST_STEP;
}

export type StepDirection = "forward" | "backward" | "none";

/** Next slides in from the right and Back from the left; no motion when the step is the same. */
export function stepDirection(from: Step, to: Step): StepDirection {
  if (to === from) return "none";
  return to > from ? "forward" : "backward";
}

// Keypad

/** Whether the three-step phone flow is on: before hydration every panel shows, as in the wide layout. */
export function isPhoneLayout(isHydrated: boolean, width: number): boolean {
  return isHydrated && width < WIDE_MIN_WIDTH;
}

/**
 * The system keyboard of the amount field. On the phone layout the keypad types instead, so the
 * system keyboard must not open on top of it; before hydration there is no keypad, and the wide
 * layout has none either, so both keep the decimal keyboard.
 */
export function amountInputMode(isHydrated: boolean, width: number): "decimal" | "none" {
  return isPhoneLayout(isHydrated, width) ? "none" : "decimal";
}

export type KeypadKey =
  "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "," | "." | "backspace";
const SEPARATOR_PATTERN = /[.,]/;

function decimalsTyped(text: string): number {
  const separatorIndex = text.search(SEPARATOR_PATTERN);
  return separatorIndex === -1 ? 0 : text.length - separatorIndex - 1;
}

/** The decimal key of the keypad: the mark the locale writes, a comma or a point. */
export function decimalSeparatorOf(locale: string): "," | "." {
  const mark = new Intl.NumberFormat(locale)
    .formatToParts(1.1)
    .find((part) => part.type === "decimal");
  return mark?.value === "," ? "," : ".";
}

/**
 * The text of the amount after one key. Text only, never a number: a key that would break the
 * amount syntax or exceed `decimals` (the decimal digits of the currency) changes nothing.
 */
export function applyKeypadKey(current: string, key: KeypadKey, decimals: number): string {
  if (key === "backspace") return current.slice(0, -1);

  if (key === "," || key === ".") {
    if (decimals === 0 || SEPARATOR_PATTERN.test(current)) return current;
    return `${current === "" ? "0" : current}${key}`;
  }

  if (SEPARATOR_PATTERN.test(current) && decimalsTyped(current) >= decimals) return current;
  const next = current === "0" ? key : `${current}${key}`;
  return isAmountDraft(next) ? next : current;
}

/**
 * What Enter does in a field. On the phone layout the first two steps behave like Next, so a
 * physical keyboard walks the steps instead of saving a half-filled form; only the last step
 * saves. Elsewhere the native submit is kept.
 */
export function enterKeyAction(step: Step, isPhone: boolean): "advance" | "submit" {
  return isPhone && step < LAST_STEP ? "advance" : "submit";
}

// Validation

export interface StepDraft {
  kind: string;
  amount: string;
  label: string;
  categoryId: string;
  date: string;
  /** For a transfer, the source. */
  accountId: string;
  destinationId: string;
}

export interface StepAccount {
  id: number;
  name: string;
  currency: string;
}

export interface StepContext {
  locale: string;
  accounts: readonly StepAccount[];
}

/** The fields the form and the server actions report errors on. */
export type StepField =
  | "kind"
  | "amount"
  | "label"
  | "categoryId"
  | "date"
  | "accountId"
  | "sourceId"
  | "destinationId"
  | "surplusAccountId"
  | "paymentMode"
  | "description";

export interface StepError {
  field: StepField;
  step: Step;
  /** What to translate, when the rules gave a reason. */
  ref?: MessageRef;
}

const STEP_OF_FIELD: Record<StepField, Step> = {
  kind: 1,
  amount: 1,
  label: 2,
  categoryId: 2,
  date: 3,
  accountId: 3,
  sourceId: 3,
  destinationId: 3,
  surplusAccountId: 3,
  paymentMode: 3,
  description: 3,
};

export function stepOfField(field: StepField): Step {
  return STEP_OF_FIELD[field];
}

/**
 * Whether an edit of these draft fields changes the field a refusal was reported on. The account
 * of the draft is the source of a transfer, which the server reports as `sourceId`.
 */
export function editsErrorField(editedKeys: readonly string[], errorField: string): boolean {
  return editedKeys.some(
    (key) => key === errorField || (key === "accountId" && errorField === "sourceId"),
  );
}

function findAccount(context: StepContext, idText: string): StepAccount | undefined {
  if (idText.trim() === "") return undefined;
  const id = Number(idText);
  return context.accounts.find((account) => account.id === id);
}

function error(field: StepField, ref: MessageRef): StepError {
  return { field, step: stepOfField(field), ref };
}

const SIGN_CHARACTERS = /^[+\-−]/;
const NON_ZERO_AMOUNT = messageRef("transactionAmountNonZero");

// Mirrors parseTransactionForm: the sign gets its own message, then the exact syntax and
// the decimals of the currency. Without a known account only the syntax can be checked.
function amountErrors(draft: StepDraft, context: StepContext): StepError[] {
  const text = draft.amount.trim();
  if (text === "") return [error("amount", NON_ZERO_AMOUNT)];
  if (SIGN_CHARACTERS.test(text)) return [error("amount", messageRef("amountUnsigned"))];

  const account = findAccount(context, draft.accountId);
  if (account === undefined) {
    const check = checkAmountSyntax(text);
    return check.ok ? [] : [error("amount", check.ref)];
  }
  try {
    return parseUnsignedAmount(text, account.currency) === 0
      ? [error("amount", NON_ZERO_AMOUNT)]
      : [];
  } catch (caught) {
    if (caught instanceof MoneyParseError) return [error("amount", caught.ref)];
    throw caught;
  }
}

// The server only requires a non-blank label; the category is optional ("Later").
function labelErrors(draft: StepDraft): StepError[] {
  return draft.label.trim() === "" ? [error("label", messageRef("transactionLabelRequired"))] : [];
}

function reviewErrors(draft: StepDraft, context: StepContext): StepError[] {
  const errors: StepError[] = [];
  if (!isCalendarDate(draft.date)) {
    errors.push(error("date", messageRef("transactionDateInvalid", { date: draft.date })));
  }
  const source = findAccount(context, draft.accountId);
  if (source === undefined) errors.push(error("accountId", messageRef("accountUnknown")));
  if (draft.kind !== TRANSFER) return errors;

  if (findAccount(context, draft.destinationId) === undefined) {
    errors.push(error("destinationId", messageRef("transferDestinationUnknown")));
  } else if (draft.destinationId === draft.accountId) {
    errors.push(error("destinationId", messageRef("transferSameAccount")));
  }
  return errors;
}

export function validateStep(step: Step, draft: StepDraft, context: StepContext): StepError[] {
  if (step === 1) return amountErrors(draft, context);
  if (step === 2) return labelErrors(draft);
  return reviewErrors(draft, context);
}

/** Every step, earliest first: what the save button checks. */
export function validateAll(draft: StepDraft, context: StepContext): StepError[] {
  return STEPS.flatMap((step) => validateStep(step, draft, context));
}

// Recap

export type AmountSign = "out" | "in" | "neutral";
export const SIGN_OF_KIND: Record<string, AmountSign> = {
  expense: "out",
  income: "in",
  interest: "in",
  transfer: "neutral",
};

export interface Recap {
  amount: { kind: string; sign: AmountSign; formatted: string | null };
  /** `categoryId` is null for "Later": the transaction goes to the to-categorize queue. */
  label: { text: string; categoryId: number | null };
  save: { kind: string; formattedAmount: string | null; destinationName: string | null };
}

export function buildRecap(draft: StepDraft, context: StepContext): Recap {
  const source = findAccount(context, draft.accountId);
  const formatted =
    source === undefined ? null : formatTypedAmount(draft.amount, source.currency, context.locale);
  const categoryText = draft.categoryId.trim();
  const destination =
    draft.kind === TRANSFER ? findAccount(context, draft.destinationId) : undefined;

  return {
    amount: { kind: draft.kind, sign: SIGN_OF_KIND[draft.kind] ?? "neutral", formatted },
    label: {
      text: draft.label.trim(),
      categoryId: categoryText === "" ? null : Number(categoryText),
    },
    save: {
      kind: draft.kind,
      formattedAmount: formatted,
      destinationName: destination?.name ?? null,
    },
  };
}
