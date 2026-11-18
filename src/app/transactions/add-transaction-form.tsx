"use client";

import { ArrowDown, ArrowUp, Clock, Percent, Tag } from "@phosphor-icons/react/ssr";
import { useLocale, useTranslations } from "next-intl";
import { useActionState, useRef, useState } from "react";

import { Button } from "../../components/button";
import { DatePicker } from "../../components/date-picker";
import { Disclosure } from "../../components/disclosure";
import { Icon } from "../../components/icon";
import { Select } from "../../components/select";
import { useIsHydrated } from "../../components/use-is-hydrated";
import { filterLabelSuggestions } from "../../domain/label-suggestions";
import {
  ENTERED_TRANSACTION_KINDS,
  PAYMENT_MODES,
  type EnteredTransactionKind,
} from "../../domain/transaction";
import type { LabelSuggestion } from "../../ledger/transaction-suggestions";
import { CONTROL_CLASS, FormField } from "../form-field";
import { useFocusFirstError } from "../use-focus-first-error";
import { AmountDisplayInput } from "./amount-display-input";
import { ChoiceChips, type ChipOption } from "./choice-chips";
import type { AccountOption, CategoryOption } from "./transaction-form";
import type {
  TransactionFormField,
  TransactionFormState,
  TransactionFormValues,
} from "./transaction-form-data";
import { formatTypedAmount } from "./typed-amount";

const SUGGESTION_LIMIT = 6;
const LATER_VALUE = "";

const KIND_ICON = { expense: ArrowUp, income: ArrowDown, interest: Percent } as const;
const KIND_TONE = {
  expense: "text-negative",
  income: "text-positive",
  interest: "text-positive",
} as const;

interface AddTransactionFormProps {
  action: (
    previous: TransactionFormState | null,
    formData: FormData,
  ) => Promise<TransactionFormState | null>;
  initialValues: TransactionFormValues;
  /** Open accounts only: no transaction can be entered on an archived one. */
  accounts: AccountOption[];
  /** Active categories. */
  categories: CategoryOption[];
  labelSuggestions: LabelSuggestion[];
  today: string;
  yesterday: string;
}

// What the form keeps in React: the fields that drive another one (the type draws the sign, the
// account sets the currency, the label filters its suggestions). The others are plain inputs.
type Draft = Pick<
  TransactionFormValues,
  "kind" | "amount" | "label" | "categoryId" | "date" | "accountId"
>;

function draftOf(values: TransactionFormValues): Draft {
  const { kind, amount, label, categoryId, date, accountId } = values;
  return { kind, amount, label, categoryId, date, accountId };
}

function isEnteredKind(value: string): value is EnteredTransactionKind {
  return (ENTERED_TRANSACTION_KINDS as readonly string[]).includes(value);
}

/**
 * The add-transaction form on a wide screen (DESIGN section 10, "Wide layout"): everything in
 * view, two columns from 760 px of available width, one column below that. An expense needs
 * only an amount and a label: the type, the date, the account and the category have defaults.
 */
export function AddTransactionForm({
  action,
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
  const [state, formAction, isPending] = useActionState(action, null);
  const formRef = useFocusFirstError(state);
  const labelRef = useRef<HTMLInputElement>(null);

  // After a submit the typed values come back with the result: they replace the draft.
  const values = state?.values ?? initialValues;
  const [draft, setDraft] = useState(() => draftOf(initialValues));
  const [seenState, setSeenState] = useState(state);
  // The key remounts the radios after each result: the automatic form reset sends them back to
  // their first checked state and React does not re-apply an unchanged `checked`.
  const [resultCount, setResultCount] = useState(0);
  if (state !== seenState) {
    setSeenState(state);
    setResultCount((count) => count + 1);
    if (state !== null) setDraft(draftOf(state.values));
  }
  const [filledCategory, setFilledCategory] = useState<string | null>(null);

  const kind = isEnteredKind(draft.kind) ? draft.kind : "expense";
  const currency = accounts.find((account) => String(account.id) === draft.accountId)?.currency;
  const formattedAmount =
    currency === undefined ? null : formatTypedAmount(draft.amount, currency, locale);
  const errorOf = (field: TransactionFormField) =>
    state?.status === "error" && state.field === field ? state.message : undefined;
  const update = (changes: Partial<Draft>) => setDraft((current) => ({ ...current, ...changes }));

  function pickSuggestion(suggestion: LabelSuggestion) {
    const categoryId = suggestion.categoryByAccount[Number(draft.accountId)];
    const category = categories.find((candidate) => candidate.id === categoryId);
    update({
      label: suggestion.label,
      ...(category === undefined ? {} : { categoryId: String(category.id) }),
    });
    setFilledCategory(category?.name ?? null);
    labelRef.current?.focus();
  }

  const categoryOptions: ChipOption[] = [
    { value: LATER_VALUE, label: add("later"), icon: Clock, tone: "later" },
    ...categories.map((category) => ({
      value: String(category.id),
      label: category.name,
      icon: Tag,
    })),
  ];
  const dateOptions: ChipOption[] = [
    { value: today, label: add("today") },
    { value: yesterday, label: add("yesterday") },
  ];
  const accountOptions: ChipOption[] = accounts.map((account) => ({
    value: String(account.id),
    label: account.name,
  }));
  const suggestions = filterLabelSuggestions(labelSuggestions, draft.label, SUGGESTION_LIMIT);
  const hasDetailsError = errorOf("description") !== undefined || errorOf("paymentMode") !== undefined;

  return (
    <form
      ref={formRef}
      action={formAction}
      noValidate
      className="@container flex flex-col gap-6"
    >
      {state?.status === "notice" ? (
        <p role="status" className="font-medium">
          {state.message}
        </p>
      ) : null}

      <div className="grid gap-8 @min-[760px]:grid-cols-2">
        <div className="flex flex-col gap-8">
          <section aria-labelledby="how-much-heading" className="flex flex-col gap-4">
            <h3 id="how-much-heading" className="text-title font-medium">
              {add("howMuch")}
            </h3>
            {/* A utility class, not an inline style: the CSP forbids style attributes. */}
            <fieldset key={resultCount} className="flex flex-col gap-1">
              <legend className="mb-1 text-caption font-medium text-text">{form("type")}</legend>
              <div className="segmented self-start [--n:3]">
                {ENTERED_TRANSACTION_KINDS.map((option) => (
                  <label key={option}>
                    <input
                      type="radio"
                      name="kind"
                      value={option}
                      checked={option === kind}
                      onChange={() => update({ kind: option })}
                    />
                    <span
                      className={`${KIND_TONE[option]} [label:has(:checked)_&]:text-on-primary`}
                    >
                      <Icon icon={KIND_ICON[option]} />
                    </span>
                    <span className="ml-2">{t(`kinds.${option}`)}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <FormField
              id="amount"
              label={form("amount")}
              hint={form("amountHint")}
              error={errorOf("amount")}
            >
              <AmountDisplayInput
                id="amount"
                name="amount"
                value={draft.amount}
                onChange={(event) => update({ amount: event.target.value })}
                direction={kind === "expense" ? "out" : "in"}
                currency={currency ?? ""}
                required
              />
            </FormField>
          </section>

          <section aria-labelledby="what-for-heading" className="flex flex-col gap-4">
            <h3 id="what-for-heading" className="text-title font-medium">
              {add("whatFor")}
            </h3>
            <FormField id="label" label={form("label")} error={errorOf("label")}>
              <input
                ref={labelRef}
                id="label"
                name="label"
                value={draft.label}
                onChange={(event) => update({ label: event.target.value })}
                className={CONTROL_CLASS}
                type="text"
                required
                autoComplete="off"
              />
            </FormField>
            {isHydrated && suggestions.length > 0 ? (
              <ul aria-label={add("labelSuggestions")} className="-mt-2 flex flex-wrap gap-2">
                {suggestions.map((suggestion) => (
                  <li key={suggestion.label}>
                    <button
                      type="button"
                      onClick={() => pickSuggestion(suggestion)}
                      className="inline-flex min-h-11 items-center rounded-pill border border-dashed border-border-control px-4 hover:bg-control"
                    >
                      {suggestion.label}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {/* Present and empty from the first render: a polite region created with its text is
                often not announced. */}
            <p aria-live="polite" className="text-caption text-text-muted not-empty:-mt-2">
              {filledCategory === null ? null : add("categoryFilled", { category: filledCategory })}
            </p>

            <ChoiceChips
              key={resultCount}
              id="categoryId"
              legend={form("category")}
              name="categoryId"
              hint={add("categoryHint")}
              value={draft.categoryId}
              onChange={(categoryId) => {
                update({ categoryId });
                setFilledCategory(null);
              }}
              options={categoryOptions}
              layout="tiles"
              error={errorOf("categoryId")}
            />
          </section>
        </div>

        <div className="flex flex-col gap-8 @min-[760px]:relative @min-[760px]:before:absolute @min-[760px]:before:-left-4 @min-[760px]:before:inset-y-0 @min-[760px]:before:w-px @min-[760px]:before:bg-divider">
          <section aria-labelledby="date-account-heading" className="flex flex-col gap-4">
            <h3 id="date-account-heading" className="text-title font-medium">
              {add("dateAccount")}
            </h3>
            {isHydrated ? (
              <ChoiceChips
                key={resultCount}
                id="datePreset"
                legend={add("when")}
                name="datePreset"
                value={draft.date}
                onChange={(date) => update({ date })}
                options={dateOptions}
                layout="row"
              />
            ) : null}
            <FormField id="date" label={add("pickDate")} error={errorOf("date")}>
              <DatePicker
                id="date"
                name="date"
                value={draft.date}
                onChange={(event) => update({ date: event.target.value })}
                required
              />
            </FormField>

            <ChoiceChips
              key={resultCount}
              id="accountId"
              legend={form("account")}
              name="accountId"
              value={draft.accountId}
              onChange={(accountId) => update({ accountId })}
              options={accountOptions}
              layout="row"
              error={errorOf("accountId")}
            />

            <Disclosure summary={add("moreDetails")} open={hasDetailsError || undefined}>
              <div className="flex flex-col gap-4 pt-2">
                <FormField
                  id="description"
                  label={form("note")}
                  optional
                  error={errorOf("description")}
                >
                  <input
                    id="description"
                    name="description"
                    defaultValue={values.description}
                    className={CONTROL_CLASS}
                    type="text"
                    autoComplete="off"
                  />
                </FormField>
                <FormField
                  id="paymentMode"
                  label={form("paymentMode")}
                  optional
                  error={errorOf("paymentMode")}
                >
                  {/* The key remounts the select: after the automatic form reset React does not
                      re-apply a changed defaultValue to the options. */}
                  <Select
                    key={values.paymentMode}
                    id="paymentMode"
                    name="paymentMode"
                    defaultValue={values.paymentMode}
                  >
                    <option value="">{common("none")}</option>
                    {PAYMENT_MODES.map((mode) => (
                      <option key={mode} value={mode}>
                        {t(`paymentModes.${mode}`)}
                      </option>
                    ))}
                  </Select>
                </FormField>
              </div>
            </Disclosure>
          </section>

          <Button
            type="submit"
            pending={isPending}
            pendingLabel={common("pending")}
            className="w-full"
          >
            {formattedAmount === null
              ? add(`submit.${kind}`)
              : add(`submitWithAmount.${kind}`, { amount: formattedAmount })}
          </Button>
        </div>
      </div>
    </form>
  );
}
