"use client";

import {
  ArrowDown,
  ArrowsLeftRight,
  ArrowUp,
  Coins,
  CreditCard,
  Percent,
  Tag,
  Tray,
} from "@phosphor-icons/react/ssr";
import { useLocale, useTranslations } from "next-intl";
import { useActionState, useEffect, useRef, useState } from "react";

import { Button } from "../../components/button";
import { DatePicker } from "../../components/date-picker";
import { Disclosure } from "../../components/disclosure";
import { Icon } from "../../components/icon";
import { useIsHydrated } from "../../components/use-is-hydrated";
import { filterLabelSuggestions } from "../../domain/label-suggestions";
import { PAYMENT_MODES, type PaymentMode } from "../../domain/transaction";
import type { LabelSuggestion } from "../../ledger/transaction-suggestions";
import { CONTROL_CLASS, FormField } from "../form-field";
import { useFocusFirstError } from "../use-focus-first-error";
import { resolveDestination, surplusTargets } from "./add-transaction-defaults";
import {
  ADD_CARD_CLASS,
  WIDE_DIVIDER_CLASS,
  WIDE_FULL_WIDTH_CLASS,
  WIDE_TWO_COLUMNS_CLASS,
} from "./add-transaction-layout";
import { AmountDisplayInput } from "./amount-display-input";
import { ChoiceChips, type ChipOption } from "./choice-chips";
import { SurplusStep } from "./surplus-step";
import type { AccountOption, CategoryOption } from "./transaction-form";
import type {
  SurplusChoice,
  TransactionFormState,
  TransactionFormValues,
  TransferFormState,
} from "./transaction-form-data";
import { formatTypedAmount } from "./typed-amount";

const SUGGESTION_LIMIT = 6;
const LATER_VALUE = "";
const TRANSFER = "transfer";

// The order of the segments (DESIGN section 10): Out, In, Move, Interest.
const FORM_KINDS = ["expense", "income", TRANSFER, "interest"] as const;
type FormKind = (typeof FORM_KINDS)[number];

const KIND_ICON = {
  expense: ArrowUp,
  income: ArrowDown,
  transfer: ArrowsLeftRight,
  interest: Percent,
} as const;
const KIND_TONE = {
  expense: "text-negative",
  income: "text-positive",
  transfer: "",
  interest: "text-positive",
} as const;
const SIGN_OF = { expense: "out", income: "in", transfer: "neutral", interest: "in" } as const;

type AddResult =
  | { mode: "transaction"; state: TransactionFormState | null }
  | { mode: "transfer"; state: TransferFormState | null };

interface AddTransactionFormProps {
  action: (
    previous: TransactionFormState | null,
    formData: FormData,
  ) => Promise<TransactionFormState | null>;
  transferAction: (
    previous: TransferFormState | null,
    formData: FormData,
  ) => Promise<TransferFormState | null>;
  initialValues: TransactionFormValues;
  /** Open accounts only: no transaction can be entered on an archived one. */
  accounts: AccountOption[];
  /** Active categories. */
  categories: CategoryOption[];
  labelSuggestions: LabelSuggestion[];
  today: string;
  yesterday: string;
}

// What the form keeps in React: the fields that drive another one (the type draws the sign and
// picks the accounts, the account sets the currency, the label filters its suggestions). The
// others are plain inputs. For a transfer the account is its source.
interface Draft {
  kind: FormKind;
  amount: string;
  label: string;
  categoryId: string;
  date: string;
  accountId: string;
  destinationId: string;
  paymentMode: "" | PaymentMode;
}

// The server is the authority on what a kind or a payment mode means: an unknown value coming
// back from it falls back to the default instead of being refused here.
function formKindOf(value: string): FormKind {
  return (FORM_KINDS as readonly string[]).includes(value) ? (value as FormKind) : "expense";
}

function paymentModeOf(value: string): "" | PaymentMode {
  return (PAYMENT_MODES as readonly string[]).includes(value) ? (value as PaymentMode) : "";
}

function draftFromValues(values: TransactionFormValues): Draft {
  return {
    ...values,
    kind: formKindOf(values.kind),
    paymentMode: paymentModeOf(values.paymentMode),
    destinationId: "",
  };
}

/** What the last result sends back: the typed values replace the draft, since the form is reset. */
function draftFromResult(current: Draft, result: AddResult): Draft {
  if (result.state === null) return current;
  if (result.mode === "transaction") {
    const { kind, amount, label, categoryId, date, accountId, paymentMode } = result.state.values;
    return {
      ...current,
      kind: formKindOf(kind),
      amount,
      label,
      categoryId,
      date,
      accountId,
      paymentMode: paymentModeOf(paymentMode),
    };
  }
  const { sourceId, destinationId, date, amount, label } = result.state.values;
  return { ...current, accountId: sourceId, destinationId, date, amount, label };
}

function surplusChoiceOf(result: AddResult | null): SurplusChoice | undefined {
  return result?.mode === "transfer" && result.state?.status === "notice"
    ? result.state.surplusChoice
    : undefined;
}

/**
 * The add-transaction form on a wide screen (DESIGN section 10, "Wide layout"): everything in
 * view, two columns from 760 px of available width, one column below that. An expense needs
 * only an amount and a label: the type, the date, the account and the category have defaults.
 * A transfer is the fourth type: it swaps the account for From and To, drops what a transfer
 * does not have, and asks what to do with a surplus above the ceiling.
 */
export function AddTransactionForm({
  action,
  transferAction,
  initialValues,
  accounts,
  categories,
  labelSuggestions,
  today,
  yesterday,
}: AddTransactionFormProps) {
  const t = useTranslations("transactions");
  const form = useTranslations("transactions.form");
  const add = useTranslations("transactions.add");
  const common = useTranslations("common");
  const locale = useLocale();
  const isHydrated = useIsHydrated();
  // One form, two server actions: the type decides which one receives the fields.
  const [result, formAction, isPending] = useActionState(
    async (_previous: AddResult | null, formData: FormData): Promise<AddResult> =>
      formData.get("kind") === TRANSFER
        ? { mode: "transfer", state: await transferAction(null, formData) }
        : { mode: "transaction", state: await action(null, formData) },
    null,
  );
  const formRef = useFocusFirstError(result);
  const labelRef = useRef<HTMLInputElement>(null);
  const saveRef = useRef<HTMLButtonElement>(null);
  const shouldFocusSave = useRef(false);

  const state = result?.state ?? null;
  const values = result?.mode === "transaction" && result.state ? result.state.values : initialValues;
  const [draft, setDraft] = useState<Draft>(() => draftFromValues(initialValues));
  const [seenResult, setSeenResult] = useState(result);
  const [isSurplusOpen, setSurplusOpen] = useState(false);
  // The key remounts the radios after each result: the automatic form reset sends them back to
  // their first checked state and React does not re-apply an unchanged `checked`.
  const [resultCount, setResultCount] = useState(0);
  if (result !== seenResult) {
    setSeenResult(result);
    setResultCount((count) => count + 1);
    setSurplusOpen(surplusChoiceOf(result) !== undefined);
    if (result !== null) setDraft((current) => draftFromResult(current, result));
  }
  const [filledCategory, setFilledCategory] = useState<string | null>(null);

  // After a cancelled surplus the focus goes back to the save button, which comes back.
  useEffect(() => {
    if (!shouldFocusSave.current || isSurplusOpen) return;
    shouldFocusSave.current = false;
    saveRef.current?.focus();
  }, [result, isSurplusOpen]);

  const { kind } = draft;
  const isTransfer = kind === TRANSFER;
  const accountIds = accounts.map((account) => account.id);
  const sourceId = Number(draft.accountId);
  const destinationId = resolveDestination({
    accountIds,
    sourceId,
    destinationId: draft.destinationId,
  });
  const nameOf = (id: number | null) => accounts.find((account) => account.id === id)?.name ?? "";
  const currency = accounts.find((account) => account.id === sourceId)?.currency;
  const formattedAmount =
    currency === undefined ? null : formatTypedAmount(draft.amount, currency, locale);
  const errorOf = (field: string) =>
    state?.status === "error" && state.field === field ? state.message : undefined;
  // Any edit makes a split already asked for stale, so it also closes the surplus step.
  const changeDraft = (changes: Partial<Draft>) => {
    setSurplusOpen(false);
    setDraft((current) => ({ ...current, ...changes }));
  };

  function pickSuggestion(suggestion: LabelSuggestion) {
    const categoryId = suggestion.categoryByAccount[sourceId];
    const category = categories.find((candidate) => candidate.id === categoryId);
    changeDraft({
      label: suggestion.label,
      ...(category === undefined ? {} : { categoryId: String(category.id) }),
    });
    setFilledCategory(category?.name ?? null);
    labelRef.current?.focus();
  }

  const kindLabel = (option: FormKind) =>
    option === TRANSFER ? add("kindMove") : t(`kinds.${option}`);
  // Move needs a second account and a script: without them the segment is left out.
  const kindOptions = FORM_KINDS.filter(
    (option) => option !== TRANSFER || (isHydrated && accounts.length > 1),
  );
  const categoryOptions: ChipOption[] = [
    { value: LATER_VALUE, label: add("later"), icon: Tray, tone: "later" },
    ...categories.map((category) => ({
      value: String(category.id),
      label: category.name,
      icon: Tag,
    })),
  ];
  const dateOptions: ChipOption[] = [
    { value: today, label: add("today"), tone: "today" },
    { value: yesterday, label: add("yesterday") },
  ];
  const accountOptions: ChipOption[] = accounts.map((account) => ({
    value: String(account.id),
    label: account.name,
    icon: account.kind === "savings" ? Coins : CreditCard,
  }));
  const paymentOptions: ChipOption[] = PAYMENT_MODES.map((mode) => ({
    value: mode,
    label: t(`paymentModes.${mode}`),
  }));
  const suggestions = filterLabelSuggestions(labelSuggestions, draft.label, SUGGESTION_LIMIT);
  const hasDetailsError = errorOf("description") !== undefined || errorOf("paymentMode") !== undefined;
  const isCustomDate = draft.date !== today && draft.date !== yesterday;
  const datePicker = (
    <DatePicker
      id="date"
      name="date"
      value={draft.date}
      onChange={(event) => changeDraft({ date: event.target.value })}
      chip={{ label: add("pickDate"), isChosen: isCustomDate }}
      required
    />
  );
  const choice = isSurplusOpen && isTransfer ? surplusChoiceOf(result) : undefined;
  const amountArgument = formattedAmount === null ? undefined : { amount: formattedAmount };
  const submitLabel = isTransfer
    ? amountArgument === undefined
      ? add("submitMove", { account: nameOf(destinationId) })
      : add("submitMoveWithAmount", { ...amountArgument, account: nameOf(destinationId) })
    : amountArgument === undefined
      ? add(`submit.${kind}`)
      : add(`submitWithAmount.${kind}`, amountArgument);

  return (
    <section aria-labelledby="new-heading" className="@container">
      <form
        ref={formRef}
        action={formAction}
        noValidate
        className={`grid gap-x-8 gap-y-6 ${ADD_CARD_CLASS} ${WIDE_TWO_COLUMNS_CLASS}`}
      >
        <h2 id="new-heading" className={`text-title font-medium ${WIDE_FULL_WIDTH_CLASS}`}>
          {t("addHeading")}
        </h2>
        {state?.status === "notice" && surplusChoiceOf(result) === undefined ? (
          <p role="status" className={`font-medium ${WIDE_FULL_WIDTH_CLASS}`}>
            {state.message}
          </p>
        ) : null}

        <div className="flex flex-col gap-6">
          <section aria-labelledby="how-much-heading" className="flex flex-col gap-4">
            <h3 id="how-much-heading" className="text-title font-medium">
              {add("howMuch")}
            </h3>
            <fieldset key={`kind-${resultCount}`}>
              <legend className="sr-only">{form("type")}</legend>
              {/* A utility class, not an inline style: the CSP forbids style attributes. */}
              <div
                className={`segmented raised grid w-full [&_label]:gap-1 [&_label]:px-0 [&_label]:text-caption ${
                  kindOptions.length === 4 ? "[--n:4]" : "[--n:3]"
                }`}
              >
                {kindOptions.map((option) => (
                  <label key={option}>
                    <input
                      type="radio"
                      name="kind"
                      value={option}
                      checked={option === kind}
                      onChange={() => changeDraft({ kind: option })}
                    />
                    <span className={KIND_TONE[option]}>
                      <Icon icon={KIND_ICON[option]} />
                    </span>
                    {kindLabel(option)}
                  </label>
                ))}
              </div>
            </fieldset>
            <FormField id="amount" label={form("amount")} hideLabel error={errorOf("amount")}>
              <AmountDisplayInput
                id="amount"
                name="amount"
                value={draft.amount}
                onChange={(event) => changeDraft({ amount: event.target.value })}
                direction={SIGN_OF[kind]}
                currency={currency ?? ""}
                required
              />
            </FormField>
          </section>

          <section aria-labelledby="what-for-heading" className="flex flex-col gap-4">
            <h3 id="what-for-heading" className="text-title font-medium">
              {add("whatFor")}
            </h3>
            <div className="flex flex-col gap-3">
              <FormField id="label" label={add("whatWasIt")} error={errorOf("label")}>
                <input
                  ref={labelRef}
                  id="label"
                  name="label"
                  value={draft.label}
                  onChange={(event) => changeDraft({ label: event.target.value })}
                  placeholder={add("labelPlaceholder")}
                  className={CONTROL_CLASS}
                  type="text"
                  required
                  autoComplete="off"
                />
              </FormField>
              {isHydrated && !isTransfer && suggestions.length > 0 ? (
                <ul aria-label={add("labelSuggestions")} className="flex flex-wrap gap-3">
                  {suggestions.map((suggestion) => (
                    <li key={suggestion.label}>
                      <button
                        type="button"
                        onClick={() => pickSuggestion(suggestion)}
                        className="inline-flex min-h-11 items-center rounded-pill border border-dashed border-border-control px-3 text-caption hover:border-solid hover:border-text"
                      >
                        {suggestion.label}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              {/* Present and empty from the first render: a polite region created with its text is
                  often not announced. */}
              <p aria-live="polite" className="text-caption text-text-muted empty:hidden">
                {filledCategory === null || isTransfer
                  ? null
                  : add("categoryFilled", { category: filledCategory })}
              </p>
            </div>

            {isTransfer ? null : (
              <ChoiceChips
                key={`categoryId-${resultCount}`}
                id="categoryId"
                legend={form("category")}
                name="categoryId"
                value={draft.categoryId}
                onChange={(categoryId) => {
                  changeDraft({ categoryId });
                  setFilledCategory(null);
                }}
                options={categoryOptions}
                layout="tiles"
                error={errorOf("categoryId")}
              />
            )}
          </section>
        </div>

        <section
          aria-labelledby="date-account-heading"
          className={`flex flex-col gap-6 ${WIDE_DIVIDER_CLASS}`}
        >
          <h3 id="date-account-heading" className="text-title font-medium">
            {add("dateAccount")}
          </h3>
          {isHydrated ? (
            <ChoiceChips
              key={`datePreset-${resultCount}`}
              id="datePreset"
              legend={add("when")}
              name="datePreset"
              value={draft.date}
              onChange={(date) => changeDraft({ date })}
              options={dateOptions}
              layout="row"
              trailing={datePicker}
              error={errorOf("date")}
            />
          ) : (
            <FormField id="date" label={add("when")} error={errorOf("date")}>
              {datePicker}
            </FormField>
          )}

          {isTransfer ? (
            <>
              <ChoiceChips
                key={`from-${resultCount}`}
                id="sourceId"
                legend={add("from")}
                name="sourceId"
                value={draft.accountId}
                onChange={(accountId) => changeDraft({ accountId })}
                options={accountOptions}
                layout="row"
                error={errorOf("sourceId")}
              />
              <ChoiceChips
                key={`to-${resultCount}-${sourceId}`}
                id="destinationId"
                legend={add("to")}
                name="destinationId"
                value={destinationId === null ? "" : String(destinationId)}
                onChange={(next) => changeDraft({ destinationId: next })}
                options={accountOptions.map((option) => ({ ...option, disabled: option.value === draft.accountId }))}
                layout="row"
                error={errorOf("destinationId")}
              />
            </>
          ) : (
            <ChoiceChips
              key={`accountId-${resultCount}`}
              id="accountId"
              legend={form("account")}
              name="accountId"
              value={draft.accountId}
              onChange={(accountId) => changeDraft({ accountId })}
              options={accountOptions}
              layout="row"
              error={errorOf("accountId")}
            />
          )}

          {isTransfer ? null : (
            <Disclosure summary={add("moreDetails")} edges="top" open={hasDetailsError || undefined}>
              <div className="flex flex-col gap-6 pt-2">
                <FormField id="description" label={form("note")} error={errorOf("description")}>
                  <input
                    id="description"
                    name="description"
                    defaultValue={values.description}
                    className={CONTROL_CLASS}
                    type="text"
                    autoComplete="off"
                  />
                </FormField>
                <ChoiceChips
                  key={`paymentMode-${resultCount}`}
                  id="paymentMode"
                  legend={form("paymentMode")}
                  name="paymentMode"
                  value={draft.paymentMode}
                  onChange={(paymentMode) => changeDraft({ paymentMode: paymentModeOf(paymentMode) })}
                  options={paymentOptions}
                  layout="row"
                  error={errorOf("paymentMode")}
                />
              </div>
            </Disclosure>
          )}

          {choice !== undefined && destinationId !== null ? (
            <SurplusStep
              key={`surplus-${resultCount}`}
              choice={choice}
              sourceName={nameOf(sourceId)}
              destinationName={nameOf(destinationId)}
              targets={surplusTargets({ accountIds, sourceId, destinationId }).map((id) => ({
                id,
                name: nameOf(id),
              }))}
              isPending={isPending}
              error={errorOf("surplusAccountId")}
              onCancel={() => {
                shouldFocusSave.current = true;
              }}
            />
          ) : (
            <Button
              ref={saveRef}
              type="submit"
              pending={isPending}
              pendingLabel={common("pending")}
              className="min-h-13 w-full"
            >
              {submitLabel}
            </Button>
          )}
        </section>
      </form>
    </section>
  );
}
