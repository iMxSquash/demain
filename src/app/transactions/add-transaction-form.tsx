"use client";

import { Coins, CreditCard, Plus, Tray } from "@phosphor-icons/react/ssr";
import { useLocale, useTranslations } from "next-intl";
import {
  useActionState,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";

import { useElementWidth } from "../../charts/use-element-width";
import { Button } from "../../components/button";
import { CHIP_DISC_CLASS, CHIP_TILE_CLASS } from "../../components/chip";
import { categoryIconOf } from "../../components/category-icons";
import { DatePicker } from "../../components/date-picker";
import { Disclosure } from "../../components/disclosure";
import { Icon } from "../../components/icon";
import { useIsHydrated } from "../../components/use-is-hydrated";
import { DEFAULT_CATEGORY_ICON } from "../../domain/category";
import { currencyDecimals } from "../../domain/money";
import { filterLabelSuggestions } from "../../domain/label-suggestions";
import { PAYMENT_MODES, type PaymentMode } from "../../domain/transaction";
import type { LabelSuggestion } from "../../ledger/transaction-suggestions";
import { CONTROL_CLASS, FormField } from "../form-field";
import { CategoryForm } from "../categories/category-form";
import type { CategoryFormState } from "../categories/category-form-data";
import { Modal } from "../modal";
import { useFocusFirstError } from "../use-focus-first-error";
import {
  findCreatedCategory,
  resolveDestination,
  surplusTargets,
} from "./add-transaction-defaults";
import {
  ADD_CARD_CLASS,
  WIDE_DIVIDER_CLASS,
  WIDE_FULL_WIDTH_CLASS,
  WIDE_HIDDEN_CLASS,
  WIDE_MIN_WIDTH,
  WIDE_TWO_COLUMNS_CLASS,
} from "./add-transaction-layout";
import { AddTransactionKeypad } from "./add-transaction-keypad";
import { AddTransactionRecap } from "./add-transaction-recap";
import { StepProgress } from "./add-transaction-progress";
import { StepNav } from "./add-transaction-step-nav";
import { StepPanel } from "./add-transaction-step-panel";
import {
  amountInputMode,
  isPhoneLayout,
  applyKeypadKey,
  buildRecap,
  decimalSeparatorOf,
  editsErrorField,
  enterKeyAction,
  nextStep,
  previousStep,
  SIGN_OF_KIND,
  stepOfField,
  validateAll,
  validateStep,
  type KeypadKey,
  type StepDraft,
  type StepError,
  type Step,
} from "./add-transaction-steps";
import { AmountDisplayInput } from "./amount-display-input";
import { KindSegments } from "./kind-segments";
import { useStepFlow } from "./use-step-flow";
import { ChoiceChips, type ChipOption } from "../../components/choice-chips";
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

const STEP_HEADING_IDS = {
  1: "how-much-heading",
  2: "what-for-heading",
  3: "date-account-heading",
} as const;

// A refusal found in the browser by the rules of `add-transaction-steps`, shown like a server one.
interface ClientError {
  field: string;
  step: Step;
  message: string;
}

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
  /** Creates a category from the modal; it refreshes the cached reads, so the list comes back with it. */
  categoryAction: (
    previous: CategoryFormState | null,
    formData: FormData,
  ) => Promise<CategoryFormState | null>;
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
 * The add-transaction form (DESIGN section 10). From 760 px of available width everything is in
 * view in two columns ("Wide layout"). Below that, once the page is interactive, the same form is
 * a three-step flow: the three panels are the same fields, only one is shown at a time, and the
 * keypad, the progress bar and the recap rows are chrome that the wide layout hides. Before
 * hydration every field is in view, in one column. An expense needs
 * only an amount and a label: the type, the date, the account and the category have defaults.
 * A transfer is the fourth type: it swaps the account for From and To, drops what a transfer
 * does not have, and asks what to do with a surplus above the ceiling.
 */
export function AddTransactionForm({
  action,
  transferAction,
  categoryAction,
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
  const categoryText = useTranslations("categories");
  const feedback = useTranslations("feedback");
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
  const { step, moveTo, showStep, headingRef } = useStepFlow();
  const separator = useMemo(() => decimalSeparatorOf(locale), [locale]);
  const containerRef = useRef<HTMLElement>(null);
  // The wide layout is a container query, so the form measures its own width; the wide fallback
  // keeps the server render and the first client render identical.
  const containerWidth = useElementWidth(containerRef, WIDE_MIN_WIDTH);
  const [clientError, setClientError] = useState<ClientError | null>(null);
  // The field whose server refusal is stale because the user edited it since.
  const [editedErrorField, setEditedErrorField] = useState<string | null>(null);
  const labelRef = useRef<HTMLInputElement>(null);
  const saveRef = useRef<HTMLButtonElement>(null);
  const shouldFocusSave = useRef(false);

  const state = result?.state ?? null;
  const values =
    result?.mode === "transaction" && result.state ? result.state.values : initialValues;
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
    setClientError(null);
    setEditedErrorField(null);
    if (result !== null) {
      setDraft((current) => draftFromResult(current, result));
      // The field the server refused may be on another step: its panel shows before the focus.
      const refusedField = result.state?.status === "error" ? result.state.field : undefined;
      if (refusedField !== undefined) showStep(stepOfField(refusedField));
      // The form is empty again after a save: the next transaction starts at the amount. On the
      // phone the save button that had the focus is gone, so the first heading takes it
      // (WCAG 2.4.3); the wide layout keeps the focus where it is.
      if (result.state?.status === "saved") {
        if (isPhoneLayout(isHydrated, containerWidth)) moveTo(1);
        else showStep(1);
      }
    }
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
  const errorOf = (field: string) => {
    if (clientError?.field === field) return clientError.message;
    if (state?.status !== "error" || state.field !== field || editedErrorField === field)
      return undefined;
    return state.message;
  };
  // Any edit makes a split already asked for stale, so it also closes the surplus step.
  const changeDraft = (changes: Partial<Draft>) => {
    setSurplusOpen(false);
    setClientError(null);
    const refusedField = state?.status === "error" ? state.field : undefined;
    if (refusedField !== undefined && editsErrorField(Object.keys(changes), refusedField)) {
      setEditedErrorField(refusedField);
    }
    setDraft((current) => ({ ...current, ...changes }));
  };

  const [isCategoryModalOpen, setCategoryModalOpen] = useState(false);
  const [createdName, setCreatedName] = useState<string | null>(null);
  // Once the refreshed list holds the category that was just created, it is the one chosen.
  const createdCategory =
    createdName === null ? undefined : findCreatedCategory(categories, createdName);
  if (createdCategory !== undefined) {
    setCreatedName(null);
    changeDraft({ categoryId: String(createdCategory.id) });
    setFilledCategory(null);
  }
  async function createCategory(previous: CategoryFormState | null, formData: FormData) {
    const state = await categoryAction(previous, formData);
    if (state === null) {
      setCreatedName(String(formData.get("name") ?? ""));
      setCategoryModalOpen(false);
    }
    return state;
  }

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
      icon: categoryIconOf(category.icon),
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
  const hasDetailsError =
    errorOf("description") !== undefined || errorOf("paymentMode") !== undefined;
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
  const stepDraft: StepDraft = {
    ...draft,
    destinationId: destinationId === null ? "" : String(destinationId),
  };
  const stepContext = { locale, accounts };
  const decimals = currency === undefined ? 0 : currencyDecimals(currency);

  // The error shows on the field of its step, and the focus goes to it once the panel is in view.
  function showError({ field, step: errorStep, ref }: StepError) {
    const formField = field === "accountId" && isTransfer ? "sourceId" : field;
    setClientError({
      field: formField,
      step: errorStep,
      message: ref === undefined ? "" : feedback(ref.key, ref.values),
    });
    showStep(errorStep);
  }
  function goToNextStep() {
    const [first] = validateStep(step, stepDraft, stepContext);
    if (first === undefined) moveTo(nextStep(step));
    else showError(first);
  }
  // A physical keyboard on the phone layout: Enter in a field of the first two steps is Next. A
  // button keeps its own Enter, and without JavaScript the native submit is untouched.
  function advanceOnEnter(event: KeyboardEvent<HTMLFormElement>) {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    if (!(event.target instanceof HTMLInputElement)) return;
    if (enterKeyAction(step, isPhoneLayout(isHydrated, containerWidth)) === "submit") return;
    event.preventDefault();
    goToNextStep();
  }
  // The save checks the amount, then the label (and the rest): the same rules on both layouts.
  function checkBeforeSubmit(event: FormEvent<HTMLFormElement>) {
    const [first] = validateAll(stepDraft, stepContext);
    if (first === undefined) return;
    event.preventDefault();
    showError(first);
  }
  // The focus goes to the field of the current client error. A server refusal of an earlier step
  // can still be displayed in a hidden panel, so the first invalid control of the form is not it.
  useEffect(() => {
    if (clientError === null) return;
    const field = document.getElementById(clientError.field);
    const target = field?.matches('[aria-invalid="true"]')
      ? field
      : document
          .getElementById(STEP_HEADING_IDS[clientError.step])
          ?.parentElement?.querySelector<HTMLElement>('[aria-invalid="true"]');
    target?.focus();
  }, [clientError]);
  const amountArgument = formattedAmount === null ? undefined : { amount: formattedAmount };
  const submitLabel = isTransfer
    ? amountArgument === undefined
      ? add("submitMove", { account: nameOf(destinationId) })
      : add("submitMoveWithAmount", { ...amountArgument, account: nameOf(destinationId) })
    : amountArgument === undefined
      ? add(`submit.${kind}`)
      : add(`submitWithAmount.${kind}`, amountArgument);

  return (
    <section ref={containerRef} aria-labelledby="new-heading" className="@container">
      <form
        ref={formRef}
        action={formAction}
        onSubmit={checkBeforeSubmit}
        onKeyDown={advanceOnEnter}
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

        {isHydrated ? <StepProgress step={step} /> : null}

        <div className="contents @min-[760px]:flex @min-[760px]:flex-col @min-[760px]:gap-6">
          <StepPanel
            step={1}
            current={step}
            isHydrated={isHydrated}
            headingId={STEP_HEADING_IDS[1]}
            headingRef={headingRef(1)}
            heading={add("howMuch")}
            className="gap-4"
          >
            <KindSegments
              key={`kind-${resultCount}`}
              name="kind"
              legend={form("type")}
              options={kindOptions}
              value={kind}
              onChange={(option) => changeDraft({ kind: option })}
              labelOf={kindLabel}
            />
            <FormField id="amount" label={form("amount")} hideLabel error={errorOf("amount")}>
              <AmountDisplayInput
                id="amount"
                name="amount"
                value={draft.amount}
                onChange={(event) => changeDraft({ amount: event.target.value })}
                direction={SIGN_OF_KIND[kind] ?? "neutral"}
                currency={currency ?? ""}
                inputMode={amountInputMode(isHydrated, containerWidth)}
                required
              />
            </FormField>
            {isHydrated ? (
              <div className={WIDE_HIDDEN_CLASS}>
                <AddTransactionKeypad
                  onKey={(key: KeypadKey) =>
                    changeDraft({ amount: applyKeypadKey(draft.amount, key, decimals) })
                  }
                  separator={separator}
                  hasDecimals={decimals > 0}
                />
              </div>
            ) : null}
            {/* Separate from the "Step N of 3" region, and present before the first key: a keypad
                press changes no focus, so the new amount is what a screen reader hears. */}
            <p aria-live="polite" className="sr-only">
              {isPhoneLayout(isHydrated, containerWidth) ? formattedAmount : null}
            </p>
            {isHydrated ? <StepNav step={step} onNext={goToNextStep} /> : null}
          </StepPanel>

          <StepPanel
            step={2}
            current={step}
            isHydrated={isHydrated}
            headingId={STEP_HEADING_IDS[2]}
            headingRef={headingRef(2)}
            heading={add("whatFor")}
            className="gap-4"
          >
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
                trailing={
                  isHydrated ? (
                    <button
                      type="button"
                      onClick={() => setCategoryModalOpen(true)}
                      className={`${CHIP_TILE_CLASS} hover:border-text`}
                    >
                      <span className={CHIP_DISC_CLASS}>
                        <Icon icon={Plus} />
                      </span>
                      {add("newCategory")}
                    </button>
                  ) : null
                }
                error={errorOf("categoryId")}
              />
            )}
            {isHydrated ? (
              <StepNav
                step={step}
                onBack={() => moveTo(previousStep(step))}
                onNext={goToNextStep}
              />
            ) : null}
          </StepPanel>
        </div>

        <StepPanel
          step={3}
          current={step}
          isHydrated={isHydrated}
          headingId={STEP_HEADING_IDS[3]}
          headingRef={headingRef(3)}
          heading={
            isHydrated ? (
              <>
                <span className={WIDE_HIDDEN_CLASS}>{add("checkAndSave")}</span>
                <span className="hidden @min-[760px]:inline">{add("dateAccount")}</span>
              </>
            ) : (
              add("dateAccount")
            )
          }
          className={`gap-6 ${WIDE_DIVIDER_CLASS}`}
        >
          {isHydrated ? (
            <AddTransactionRecap
              recap={buildRecap(stepDraft, stepContext)}
              kind={kind}
              kindOptions={kindOptions}
              kindLabel={kindLabel}
              amount={draft.amount}
              label={draft.label}
              categoryId={draft.categoryId}
              currency={currency ?? ""}
              categoryOptions={categoryOptions}
              resultCount={resultCount}
              onChange={changeDraft}
            />
          ) : null}
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
                options={accountOptions.map((option) => ({
                  ...option,
                  disabled: option.value === draft.accountId,
                }))}
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
            <Disclosure
              summary={add("moreDetails")}
              edges="top"
              open={hasDetailsError || undefined}
            >
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
                  onChange={(paymentMode) =>
                    changeDraft({ paymentMode: paymentModeOf(paymentMode) })
                  }
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
          {isHydrated ? <StepNav step={step} onBack={() => moveTo(previousStep(step))} /> : null}
        </StepPanel>
      </form>
      <Modal
        isOpen={isCategoryModalOpen}
        onClose={() => setCategoryModalOpen(false)}
        title={add("newCategory")}
      >
        <CategoryForm
          action={createCategory}
          initialName=""
          initialIcon={DEFAULT_CATEGORY_ICON}
          submitLabel={categoryText("addSubmit")}
          onCancel={() => setCategoryModalOpen(false)}
        />
      </Modal>
    </section>
  );
}
