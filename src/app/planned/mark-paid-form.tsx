"use client";

import { useTranslations } from "next-intl";
import { useActionState, useEffect, useId, useRef, type ReactNode, type RefObject } from "react";

import { Button } from "../../components/button";
import { DatePicker } from "../../components/date-picker";
import { AmountInput } from "../amount-input";
import { CONTROL_CLASS, FormField } from "../form-field";
import { SurplusStep } from "../transactions/surplus-step";
import { useFocusFirstError } from "../use-focus-first-error";
import { markOccurrencePaidAction } from "./actions";
import type { MarkPaidFormState, MarkPaidFormValues } from "./mark-paid-form-data";

/** The words of the button of one occurrence, built on the server: its type names it. */
export interface MarkPaidButtonText {
  /** "Mark as paid", "Mark as received" or "Mark as transferred". */
  label: string;
  /** Starts with the label and names the occurrence: "Mark as paid, Rent, due 5 Nov 2026". */
  ariaLabel: string;
  pendingLabel: string;
}

interface MarkPaidTarget {
  itemId: number;
  nominalDate: string;
}

/**
 * Posts the form, then runs `onRecorded` once the transaction is recorded. The surplus step of a
 * planned transfer and a cancel on it are states of their own: nothing is recorded for them.
 */
function useMarkPaid(onRecorded: () => void) {
  return useActionState(async (previous: MarkPaidFormState | null, formData: FormData) => {
    const result = await markOccurrencePaidAction(previous, formData);
    if (result === null) onRecorded();
    return result;
  }, null);
}

function TargetFields({ itemId, nominalDate }: MarkPaidTarget) {
  return (
    <>
      <input type="hidden" name="itemId" value={itemId} />
      <input type="hidden" name="nominalDate" value={nominalDate} />
    </>
  );
}

/** The step of a planned transfer above a ceiling (DESIGN section 10), in place of the button. */
function SurplusOr({
  state,
  isPending,
  children,
}: {
  state: MarkPaidFormState | null;
  isPending: boolean;
  children: ReactNode;
}) {
  if (state?.status !== "surplus") return children;
  const { step } = state;
  return (
    <SurplusStep
      choice={step.choice}
      sourceName={step.sourceName}
      destinationName={step.destinationName}
      targets={step.targets}
      isPending={isPending}
      // The focus goes back to the button once the server has answered the cancel.
      onCancel={() => undefined}
    />
  );
}

function focusLater(element: HTMLElement | null | undefined): void {
  requestAnimationFrame(() => element?.focus());
}

// The button is unmounted while the surplus step shows: once Cancel brings it back, it takes the focus.
function useFocusOnCancel(state: MarkPaidFormState | null, buttonRef: RefObject<HTMLButtonElement | null>): void {
  useEffect(() => {
    if (state?.status === "cancelled") buttonRef.current?.focus();
  }, [state, buttonRef]);
}

function RefusalMessage({ message }: { message: string }) {
  const common = useTranslations("common");
  return (
    <p role="alert" className="text-caption font-medium text-negative">
      {common("error", { message })}
    </p>
  );
}

/** A refusal that no visible field explains: a chosen surplus account, or a planned value. */
function Refusal({ state, visibleFields }: { state: MarkPaidFormState | null; visibleFields: readonly string[] }) {
  if (state?.status !== "error" || state.field === undefined || visibleFields.includes(state.field)) return null;
  return <RefusalMessage message={state.message} />;
}

const CARD_FIELDS = ["date", "amount"] as const;

interface MarkPaidCardFormProps extends MarkPaidTarget {
  text: MarkPaidButtonText;
  initialValues: MarkPaidFormValues;
  /** The visible labels, short: "Date", "Amount" or "Remaining amount". */
  dateLabel: string;
  amountLabel: string;
  /** Read after each label by assistive technology: "of Rent, due 5 Nov 2026". */
  fieldSubject: string;
  /** The id of the button, which the card before this one aims at. */
  buttonId: string;
  /** Where the focus goes once this card leaves: the button of the next card, else the heading. */
  focusAfterId: string;
  /** The description of the occurrence, drawn on the server. */
  children: ReactNode;
}

/**
 * One card of the "To pay" page (DESIGN section 18): the occurrence, its date and amount, both
 * editable, and the button of its type, which records the transaction with what the fields hold.
 */
export function MarkPaidCardForm({
  itemId,
  nominalDate,
  text,
  initialValues,
  dateLabel,
  amountLabel,
  fieldSubject,
  buttonId,
  focusAfterId,
  children,
}: MarkPaidCardFormProps) {
  const baseId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [state, formAction, isPending] = useMarkPaid(() => focusLater(document.getElementById(focusAfterId)));
  const formRef = useFocusFirstError(state?.status === "error" ? state : null);
  useFocusOnCancel(state, buttonRef);
  const values = state?.values ?? initialValues;
  const errorOf = (field: "date" | "amount") =>
    state?.status === "error" && state.field === field ? state.message : undefined;

  return (
    <form
      ref={formRef}
      action={formAction}
      noValidate
      className="grid grid-cols-1 items-end gap-4 rounded-card bg-surface p-4 @min-[768px]:grid-cols-[minmax(0,1fr)_176px_160px_192px]"
    >
      <TargetFields itemId={itemId} nominalDate={nominalDate} />
      <div className="self-center">{children}</div>
      <FormField id={`${baseId}-date`} label={dateLabel} error={errorOf("date")}>
        <DatePicker
          id={`${baseId}-date`}
          name="date"
          aria-label={`${dateLabel} ${fieldSubject}`}
          defaultValue={values.date}
        />
      </FormField>
      <FormField id={`${baseId}-amount`} label={amountLabel} error={errorOf("amount")}>
        <AmountInput
          id={`${baseId}-amount`}
          name="amount"
          aria-label={`${amountLabel} ${fieldSubject}`}
          defaultValue={values.amount}
          className={`${CONTROL_CLASS} text-right`}
        />
      </FormField>
      <div className={state?.status === "surplus" ? "col-span-full" : undefined}>
        <SurplusOr state={state} isPending={isPending}>
          <Button
            ref={buttonRef}
            id={buttonId}
            type="submit"
            variant="secondary"
            aria-label={text.ariaLabel}
            pending={isPending}
            pendingLabel={text.pendingLabel}
            className="w-full"
          >
            {text.label}
          </Button>
        </SurplusOr>
      </div>
      <div className="col-span-full empty:hidden">
        <Refusal state={state} visibleFields={CARD_FIELDS} />
      </div>
    </form>
  );
}

interface MarkPaidButtonProps extends MarkPaidTarget {
  text: MarkPaidButtonText;
  /** The planned date and amount, recorded as they are (owner, 25 Nov 2026): no form. */
  values: MarkPaidFormValues;
  /** Called once recorded: the occurrence leaves the list with its button. */
  onRecorded: () => void;
}

/**
 * The one-click button of an occurrence in the calendar (DESIGN section 18, "Actions on an
 * occurrence"). A planned transfer above a ceiling shows the surplus step in its place.
 */
export function MarkPaidButton({ itemId, nominalDate, text, values, onRecorded }: MarkPaidButtonProps) {
  const [state, formAction, isPending] = useMarkPaid(onRecorded);
  const buttonRef = useRef<HTMLButtonElement>(null);
  useFocusOnCancel(state, buttonRef);

  return (
    <form action={formAction} className={state?.status === "surplus" ? "w-full" : undefined}>
      <TargetFields itemId={itemId} nominalDate={nominalDate} />
      <input type="hidden" name="date" value={values.date} />
      <input type="hidden" name="amount" value={values.amount} />
      <SurplusOr state={state} isPending={isPending}>
        <Button
          ref={buttonRef}
          type="submit"
          variant="secondary"
          aria-label={text.ariaLabel}
          pending={isPending}
          pendingLabel={text.pendingLabel}
        >
          {text.label}
        </Button>
      </SurplusOr>
      <Refusal state={state} visibleFields={[]} />
    </form>
  );
}
