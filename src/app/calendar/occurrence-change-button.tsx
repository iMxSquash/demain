"use client";

import { useTranslations } from "next-intl";
import { useActionState, useEffect, useId, useRef, useState } from "react";

import { Button } from "../../components/button";
import { DatePicker } from "../../components/date-picker";
import { AmountInput } from "../amount-input";
import { CONTROL_CLASS, FormField } from "../form-field";
import { Modal } from "../modal";
import { useFocusFirstError } from "../use-focus-first-error";
import { deleteOccurrenceOverrideAction, saveOccurrenceOverrideAction } from "./actions";
import {
  SAVE_INTENT,
  SKIP_INTENT,
  type OccurrenceOverrideFormField,
  type OccurrenceOverrideFormValues,
} from "./occurrence-override-form-data";

/** Where the focus goes when the row of a changed occurrence leaves the page (DESIGN section 6). */
const FOCUS_FALLBACK_SELECTORS = ["[data-day-heading]", "[data-focus-fallback]"];

export interface OccurrenceChangeButtonProps {
  itemId: number;
  /** YYYY-MM-DD: the date the schedule gives the occurrence, which names it. */
  nominalDate: string;
  /** The visible word of the button, "Change". */
  label: string;
  /** The item and the date, for assistive technology only: "Rent, 5 March 2026". */
  subject: string;
  /** The heading of the dialog, which names the occurrence. */
  title: string;
  /** Restore is only offered when the occurrence has an override. */
  hasOverride: boolean;
  isSkipped: boolean;
  /** What the override already stores, so that saving again keeps it; blank keeps the computed value. */
  initialValues: OccurrenceOverrideFormValues;
}

// The dialog closes on the server's answer, which can also take the row away (a move to another
// day or month): the native dialog then has no trigger to give the focus back to, and it would land
// on the body. It goes to the nearest heading instead.
function focusFallbackIfLost(): void {
  requestAnimationFrame(() => {
    const active = document.activeElement;
    if (active !== null && active !== document.body) return;
    for (const selector of FOCUS_FALLBACK_SELECTORS) {
      const target = document.querySelector<HTMLElement>(selector);
      if (target !== null) {
        target.focus();
        return;
      }
    }
  });
}

/** The "Change" button of one planned occurrence, and the dialog that skips, moves or restores it. */
export function OccurrenceChangeButton(props: OccurrenceChangeButtonProps) {
  const { label, subject, title } = props;
  const [isOpen, setIsOpen] = useState(false);
  // True from the opening until the native dialog has closed, the exit motion included.
  const isEngagedRef = useRef(false);

  useEffect(
    () => () => {
      if (isEngagedRef.current) focusFallbackIfLost();
    },
    [],
  );

  return (
    <>
      <Button
        type="button"
        variant="link"
        onClick={() => {
          isEngagedRef.current = true;
          setIsOpen(true);
        }}
      >
        {label}
        <span className="sr-only">{` ${subject}`}</span>
      </Button>
      <Modal
        isOpen={isOpen}
        onClose={() => {
          isEngagedRef.current = false;
          setIsOpen(false);
        }}
        title={title}
      >
        <OccurrenceChangeForms {...props} onClose={() => setIsOpen(false)} />
      </Modal>
    </>
  );
}

type OccurrenceChangeFormsProps = OccurrenceChangeButtonProps & {
  /** Asked for by Cancel and by a saved change. */
  onClose: () => void;
};

function OccurrenceChangeForms({
  itemId,
  nominalDate,
  hasOverride,
  isSkipped,
  initialValues,
  onClose,
}: OccurrenceChangeFormsProps) {
  const t = useTranslations("calendar.occurrenceForm");
  const common = useTranslations("common");
  const baseId = useId();
  const [state, formAction, isPending] = useActionState(
    async (...args: Parameters<typeof saveOccurrenceOverrideAction>) => {
      const result = await saveOccurrenceOverrideAction(...args);
      if (result === null) onClose();
      return result;
    },
    null,
  );
  const [restoreState, restoreAction, isRestoring] = useActionState(
    async (...args: Parameters<typeof deleteOccurrenceOverrideAction>) => {
      const result = await deleteOccurrenceOverrideAction(...args);
      if (result === null) onClose();
      return result;
    },
    null,
  );
  const formRef = useFocusFirstError(state);
  const values = state?.values ?? initialValues;
  const idOf = (field: OccurrenceOverrideFormField) => `${baseId}-${field}`;
  const errorOf = (field: OccurrenceOverrideFormField) => (state?.field === field ? state.message : undefined);
  const target = (
    <>
      <input type="hidden" name="itemId" value={itemId} />
      <input type="hidden" name="nominalDate" value={nominalDate} />
    </>
  );

  return (
    <>
      <p>{t("onlyThis")}</p>
      {isSkipped ? <p className="text-text-muted">{t("skipped")}</p> : null}

      <form ref={formRef} action={formAction} noValidate className="flex flex-col gap-4">
        {target}
        <FormField
          id={idOf("overrideDate")}
          label={t("newDate")}
          optional
          hint={t("newDateHint")}
          error={errorOf("overrideDate")}
        >
          <DatePicker id={idOf("overrideDate")} name="overrideDate" defaultValue={values.overrideDate} />
        </FormField>
        <FormField
          id={idOf("overrideAmount")}
          label={t("newAmount")}
          optional
          hint={t("newAmountHint")}
          error={errorOf("overrideAmount")}
        >
          <AmountInput
            id={idOf("overrideAmount")}
            name="overrideAmount"
            defaultValue={values.overrideAmount}
            className={CONTROL_CLASS}
          />
        </FormField>

        {/* A refusal about the occurrence itself, such as a linked one, has no field to sit on. */}
        {state !== null && state.field === undefined ? (
          <p role="alert" className="font-medium text-negative">
            {common("error", { message: state.message })}
          </p>
        ) : null}

        {/* Save comes first: Enter in a field submits with the first button, never with Skip. */}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" name="intent" value={SAVE_INTENT} pending={isPending} pendingLabel={common("pending")}>
            {t("save")}
          </Button>
          <Button type="submit" name="intent" value={SKIP_INTENT} variant="secondary" pending={isPending}>
            {t("skip")}
          </Button>
          <Button type="button" variant="link" onClick={onClose}>
            {common("cancel")}
          </Button>
        </div>
      </form>

      {hasOverride ? (
        <form action={restoreAction} className="flex flex-col gap-2 border-t border-divider pt-4">
          {target}
          {restoreState === null ? null : (
            <p role="alert" className="font-medium text-negative">
              {common("error", { message: restoreState.message })}
            </p>
          )}
          <Button
            type="submit"
            variant="secondary"
            pending={isRestoring}
            pendingLabel={common("pending")}
            className="self-start"
          >
            {t("restore")}
          </Button>
        </form>
      ) : null}
    </>
  );
}
