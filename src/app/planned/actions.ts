"use server";

import { getLocale, getTimeZone } from "next-intl/server";
import { redirect } from "next/navigation";

import { parseWholeNumber } from "../../domain/amount-syntax";
import { messageRef, type MessageRef, type Translate } from "../../domain/message";
import { formatAmount } from "../../domain/money";
import type { PlannedItemField, PlannedItemKind } from "../../domain/planned-item";
import { TransactionValidationError } from "../../domain/transaction";
import { todayIn } from "../../i18n/dates";
import { AccountNotFoundError, getAccount, listAccounts } from "../../ledger/accounts";
import {
  linkByHand,
  markOccurrencePaid,
  PlannedLinkError,
  type MarkPaidResult,
} from "../../ledger/planned-matching";
import {
  getTransaction,
  SurplusDecisionRequiredError,
  type SurplusDecision,
  type TransferRequest,
} from "../../ledger/transactions";
import type { AppDatabase } from "../../storage/database";
import {
  addPlannedItemVersion,
  cancelPlannedItem,
  createPlannedItem,
  deletePlannedItem,
  getPlannedItem,
  PlannedItemNotFoundError,
  setPlannedItemEnd,
  updatePlannedItemDetails,
} from "../../ledger/planned-items";
import { withDatabase } from "../../storage/with-database";
import { requireSession } from "../auth/session";
import { refreshData } from "../data-cache";
import { flashError, flashSuccess, runWithNotice } from "../feedback/flash";
import { readOccurrenceTarget } from "../calendar/occurrence-override-form-data";
import { parseMonthParam } from "../calendar/lines/calendar-lines-params";
import { getTranslator } from "../translator";
import { readDecision, type CurrencyByAccount } from "../transactions/transaction-form-data";
import { TRANSFER_DECISION } from "../transactions/transfer-decision";
import { calendarHref, parseBackView } from "./link-params";
import {
  DECIDED_AMOUNT_FIELD,
  DECIDED_DATE_FIELD,
  parseMarkPaidForm,
  readSubmittedMarkPaid,
  type MarkPaidFormState,
  type MarkPaidFormValues,
  type MarkPaidSurplusStep,
} from "./mark-paid-form-data";
import { MARKED_FEEDBACK, markPaidKindOf } from "./mark-paid-kind";
import { describeFailure, toFailureState } from "./planned-item-failure";
import {
  formFieldOf,
  parsePlannedItemDetailsForm,
  parsePlannedItemEndDateForm,
  parsePlannedItemForm,
  parsePlannedItemVersionForm,
  readSubmittedDetails,
  readSubmittedEndDate,
  readSubmittedValues,
  readSubmittedVersion,
  readText,
  type PlannedItemDetailsFormState,
  type PlannedItemEndDateFormState,
  type PlannedItemFormState,
  type PlannedItemVersionFormState,
} from "./planned-item-form-data";

const PLANNED_PATH = "/planned";
const DETAILS_FIELDS = [
  "name",
  "categoryId",
  "provisionLabelFilter",
  "matchWindowDays",
  "matchTolerancePercent",
] as const;

function loadCurrencies(): CurrencyByAccount {
  return withDatabase(
    (db) => new Map(listAccounts(db).map((account) => [account.id, account.currency])),
  );
}

// A refusal on a field the edit form has no control for is shown as a message.
const detailsControlOf = (field: PlannedItemField) =>
  DETAILS_FIELDS.find((candidate) => candidate === formFieldOf(field));

// The controls of the version form that the domain can refuse; the business day rule has no
// refusal of its own, and a refusal on another field is shown as a message.
const VERSION_FIELDS = [
  "effectiveFrom",
  "repetition",
  "amount",
  "amountMode",
  "averageWindow",
] as const;
const versionControlOf = (field: PlannedItemField) =>
  VERSION_FIELDS.find((candidate) => candidate === field);
const endDateControlOf = (field: PlannedItemField) => (field === "endDate" ? field : undefined);

export async function createPlannedItemAction(
  _previous: PlannedItemFormState | null,
  formData: FormData,
): Promise<PlannedItemFormState | null> {
  await requireSession();
  const translate = await getTranslator();
  const parsed = parsePlannedItemForm(formData, loadCurrencies(), translate);
  if (!parsed.ok) return parsed.error;

  try {
    withDatabase((db) => createPlannedItem(db, parsed.input));
  } catch (error) {
    return {
      ...(await toFailureState(error, translate, formFieldOf)),
      values: readSubmittedValues(formData),
    };
  }

  refreshData();
  await flashSuccess("plannedItemCreated");
  return null;
}

export async function updatePlannedItemAction(
  id: number,
  _previous: PlannedItemDetailsFormState | null,
  formData: FormData,
): Promise<PlannedItemDetailsFormState | null> {
  await requireSession();
  const translate = await getTranslator();

  const parsed = parsePlannedItemDetailsForm(formData, translate);
  if (!parsed.ok) return parsed.error;

  try {
    // The domain refuses a label filter on an item that is not a provision.
    withDatabase((db) => updatePlannedItemDetails(db, id, parsed.details));
  } catch (error) {
    return {
      ...(await toFailureState(error, translate, detailsControlOf)),
      values: readSubmittedDetails(formData),
    };
  }

  refreshData();
  await flashSuccess("plannedItemUpdated");
  // redirect throws, so it stays outside the try block.
  redirect(PLANNED_PATH);
}

type VersionOutcome =
  { rejected: PlannedItemVersionFormState } | { replaced: boolean; effectiveFrom: string };

export async function addPlannedItemVersionAction(
  itemId: number,
  _previous: PlannedItemVersionFormState | null,
  formData: FormData,
): Promise<PlannedItemVersionFormState | null> {
  await requireSession();
  const translate = await getTranslator();

  let outcome: VersionOutcome;
  try {
    outcome = withDatabase((db) => {
      // The kind gives the sign of the amount and the account its currency: both are read first.
      const { kind, accountId } = getPlannedItem(db, itemId);
      const { currency } = getAccount(db, accountId);
      const parsed = parsePlannedItemVersionForm(formData, { kind, currency }, translate);
      if (!parsed.ok) return { rejected: parsed.error };
      const { replaced } = addPlannedItemVersion(db, itemId, parsed.input);
      return { replaced, effectiveFrom: parsed.input.effectiveFrom };
    });
  } catch (error) {
    return {
      ...(await toFailureState(error, translate, versionControlOf)),
      values: readSubmittedVersion(formData),
    };
  }
  if ("rejected" in outcome) return outcome.rejected;

  refreshData();
  // Replacing a version is told, so that nobody believes a second one was added.
  if (outcome.replaced) {
    await flashSuccess("plannedItemVersionReplaced", { date: outcome.effectiveFrom });
  } else {
    await flashSuccess("plannedItemVersionSaved");
  }
  return null;
}

type EndDateOutcome = { rejected: PlannedItemEndDateFormState } | { endDate: string | null };

export async function setPlannedItemEndAction(
  itemId: number,
  _previous: PlannedItemEndDateFormState | null,
  formData: FormData,
): Promise<PlannedItemEndDateFormState | null> {
  await requireSession();
  const translate = await getTranslator();

  let outcome: EndDateOutcome;
  try {
    outcome = withDatabase((db) => {
      const parsed = parsePlannedItemEndDateForm(formData);
      if (!parsed.ok) return { rejected: parsed.error };
      setPlannedItemEnd(db, itemId, parsed.endDate);
      return { endDate: parsed.endDate };
    });
  } catch (error) {
    return {
      ...(await toFailureState(error, translate, endDateControlOf)),
      values: readSubmittedEndDate(formData),
    };
  }
  if ("rejected" in outcome) return outcome.rejected;

  refreshData();
  await flashSuccess(
    outcome.endDate === null ? "plannedItemEndDateCleared" : "plannedItemEndDateSaved",
  );
  return null;
}

export async function cancelPlannedItemAction(itemId: number): Promise<void> {
  await requireSession();
  await runWithNotice(
    () => {
      withDatabase((db) => cancelPlannedItem(db, itemId));
    },
    { success: "plannedItemCancelled", describeFailure },
  );
  refreshData();
}

export async function deletePlannedItemAction(itemId: number): Promise<void> {
  await requireSession();
  try {
    // The id is bound by the page, but the endpoint can be called with any value.
    if (!Number.isSafeInteger(itemId) || itemId < 1) throw new PlannedItemNotFoundError(itemId);
    withDatabase((db) => deletePlannedItem(db, itemId));
  } catch (error) {
    await flashError(describeFailure(error));
    // An item that is still there keeps its page, where the user reads why; a gone one has none.
    if (error instanceof PlannedItemNotFoundError) redirect(PLANNED_PATH);
    return;
  }

  refreshData();
  await flashSuccess("plannedItemDeleted");
  // redirect throws, so it stays outside the try block.
  redirect(PLANNED_PATH);
}

// A refusal on the date or the amount sits on its field; any other one is told in a toast.
function describeMarkPaidFailure(error: unknown): { field?: "date" | "amount"; ref: MessageRef } {
  if (error instanceof TransactionValidationError) {
    const field = error.field === "date" || error.field === "amount" ? error.field : undefined;
    return { ...(field === undefined ? {} : { field }), ref: error.ref };
  }
  if (error instanceof PlannedLinkError) return { ref: error.ref };
  if (error instanceof AccountNotFoundError) return { ref: messageRef("accountGone") };
  if (error instanceof PlannedItemNotFoundError) return { ref: messageRef("plannedItemGone") };
  console.error("Mark as paid failed", error);
  return { ref: messageRef("nothingSaved") };
}

async function markPaidFailure(
  error: unknown,
  values: MarkPaidFormValues,
  translate: Translate,
): Promise<MarkPaidFormState> {
  const { field, ref } = describeMarkPaidFailure(error);
  if (field === undefined) await flashError(ref);
  return {
    status: "error",
    ...(field === undefined ? {} : { field }),
    message: translate(ref),
    values,
  };
}

// The split is the server's computation: the step only shows it and posts the decision.
function surplusStepOf(
  db: AppDatabase,
  request: TransferRequest,
  error: SurplusDecisionRequiredError,
  locale: string,
): MarkPaidSurplusStep {
  const source = getAccount(db, request.sourceId);
  const destination = getAccount(db, request.destinationId);
  const format = (minorUnits: number) => formatAmount(minorUnits, source.currency, locale);
  const { split } = error;
  return {
    choice: {
      depositedText: format(split.deposited),
      surplusText: format(split.surplus),
      suggestedAccountId:
        split.suggestedOverflowAccountId === null ? "" : String(split.suggestedOverflowAccountId),
    },
    sourceName: source.name,
    destinationName: destination.name,
    // A transfer cannot cross currencies, so only the accounts of the same currency can take the rest.
    targets: listAccounts(db)
      .filter(
        ({ id, currency }) =>
          id !== source.id && id !== destination.id && currency === source.currency,
      )
      .map(({ id, name }) => ({ id, name })),
  };
}

type Feedback = { key: Parameters<typeof flashSuccess>[0]; values: Record<string, string> };

type MarkPaidOutcome = { state: MarkPaidFormState } | { feedback: Feedback };

interface MarkPaidContext {
  itemId: number;
  nominalDate: string;
  values: MarkPaidFormValues;
  today: string;
  locale: string;
  translate: Translate;
}

// The toast says what was recorded. A surplus left in the source, or an income above the ceiling,
// carries a figure, so it is told instead.
function feedbackOf(
  db: AppDatabase,
  item: {
    kind: PlannedItemKind;
    name: string;
    accountId: number;
    destinationAccountId: number | null;
  },
  { unplaced, ceilingExcess }: MarkPaidResult,
  decision: SurplusDecision | null,
  locale: string,
): Feedback {
  const source = getAccount(db, item.accountId);
  if (ceilingExcess > 0) {
    return {
      key: "occurrenceReceivedAboveCeiling",
      values: { name: item.name, excess: formatAmount(ceilingExcess, source.currency, locale) },
    };
  }
  if (unplaced === 0 || item.destinationAccountId === null) {
    return { key: MARKED_FEEDBACK[markPaidKindOf(item.kind)], values: { name: item.name } };
  }
  const full = decision?.kind === "send-surplus" ? decision.accountId : item.destinationAccountId;
  return {
    key: "transferUnplaced",
    values: {
      amount: formatAmount(unplaced, source.currency, locale),
      source: source.name,
      full: getAccount(db, full).name,
    },
  };
}

function markInDatabase(
  db: AppDatabase,
  formData: FormData,
  context: MarkPaidContext,
): MarkPaidOutcome {
  const { itemId, nominalDate, values, today, locale, translate } = context;
  // The kind gives the sign and the account the minor units: neither comes from the form.
  const item = getPlannedItem(db, itemId);
  const parsed = parseMarkPaidForm(values, getAccount(db, item.accountId).currency, translate);
  if (!parsed.ok) return { state: parsed.error };
  const currencies: CurrencyByAccount = new Map(
    listAccounts(db).map(({ id, currency }) => [id, currency]),
  );
  const decision = readDecision(formData, currencies, translate);
  if ("message" in decision) {
    return {
      state: { status: "error", field: "surplusAccountId", message: decision.message, values },
    };
  }
  const request = { plannedItemId: item.id, nominalDate, ...parsed.input };
  try {
    // A decision taken on a split of other values is stale: the step is shown again for these ones.
    const isStale =
      readText(formData, DECIDED_AMOUNT_FIELD) !== values.amount ||
      readText(formData, DECIDED_DATE_FIELD) !== values.date;
    const result = markOccurrencePaid(db, request, today, isStale ? null : decision.value);
    return { feedback: feedbackOf(db, item, result, decision.value, locale) };
  } catch (error) {
    if (!(error instanceof SurplusDecisionRequiredError) || item.destinationAccountId === null)
      throw error;
    const transfer: TransferRequest = {
      sourceId: item.accountId,
      destinationId: item.destinationAccountId,
      amount: request.amount,
      date: request.date,
      label: item.name,
    };
    return {
      state: { status: "surplus", step: surplusStepOf(db, transfer, error, locale), values },
    };
  }
}

/**
 * Records the real transaction of a due occurrence and links it (DOMAIN, "Matching planned vs
 * actual"). The card of the "To pay" page posts the date and the amount it shows; the one-click
 * buttons of the calendar post the planned ones. A planned transfer above a ceiling answers with
 * the surplus step and records nothing until the user decides. A null state means recorded.
 */
export async function markOccurrencePaidAction(
  _previous: MarkPaidFormState | null,
  formData: FormData,
): Promise<MarkPaidFormState | null> {
  await requireSession();
  const [translate, locale, timeZone] = await Promise.all([
    getTranslator(),
    getLocale(),
    getTimeZone(),
  ]);
  const values = readSubmittedMarkPaid(formData);
  if (formData.get("decision") === TRANSFER_DECISION.cancel) return { status: "cancelled", values };
  const read = readOccurrenceTarget(formData);
  if (!read.ok) {
    await flashError(read.ref);
    return { status: "error", message: translate(read.ref), values };
  }

  let outcome: MarkPaidOutcome;
  try {
    outcome = withDatabase((db) =>
      markInDatabase(db, formData, {
        ...read.target,
        values,
        today: todayIn(timeZone, new Date()),
        locale,
        translate,
      }),
    );
  } catch (error) {
    return markPaidFailure(error, values, translate);
  }
  if ("state" in outcome) return outcome.state;

  refreshData();
  await flashSuccess(outcome.feedback.key, outcome.feedback.values);
  return null;
}

// Same rule as the ids of `readOccurrenceTarget`: a positive safe integer typed in digits only.
function transactionIdOf(formData: FormData): number | null {
  const id = parseWholeNumber(readText(formData, "transactionId"));
  return id !== null && id >= 1 && Number.isSafeInteger(id) ? id : null;
}

/**
 * Links a transaction chosen on the "Link a transaction" page to its occurrence, then goes back to
 * the calendar. The ledger checks the pair again: same account, same sign, open occurrence. The
 * category is never changed. A refusal is a message above the list.
 */
export async function linkTransactionToOccurrenceAction(
  _previous: string | null,
  formData: FormData,
): Promise<string | null> {
  await requireSession();
  const [translate, timeZone] = await Promise.all([getTranslator(), getTimeZone()]);
  const read = readOccurrenceTarget(formData);
  const transactionId = transactionIdOf(formData);
  if (!read.ok || transactionId === null) return translate(messageRef("occurrenceLinkFailed"));
  const { itemId, nominalDate } = read.target;
  const month = parseMonthParam(readText(formData, "month"), nominalDate.slice(0, 7));
  const back = calendarHref(parseBackView(formData.get("back")), month);
  const today = todayIn(timeZone, new Date());

  let names: { transaction: string; name: string };
  try {
    names = withDatabase((db) => {
      linkByHand(db, { transactionId, plannedItemId: itemId, nominalDate }, today);
      return {
        transaction: getTransaction(db, transactionId).label,
        name: getPlannedItem(db, itemId).name,
      };
    });
  } catch (error) {
    if (error instanceof PlannedLinkError || error instanceof TransactionValidationError) {
      return translate(error.ref);
    }
    console.error("Link by hand failed", error);
    return translate(messageRef("occurrenceLinkFailed"));
  }

  refreshData();
  await flashSuccess("occurrenceLinkedTo", names);
  // redirect throws, so it stays outside the try block.
  redirect(back);
}
