"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { Button } from "../../components/button";
import { CONTROL_CLASS, FormField } from "../form-field";
import { useFocusFirstError } from "../use-focus-first-error";
import type { RateFormState, RateFormValues } from "./currency-form-data";

interface RateFormProps {
  action: (
    previous: RateFormState | null,
    formData: FormData,
  ) => Promise<RateFormState | null>;
  initialValues: RateFormValues;
}

export function RateForm({ action, initialValues }: RateFormProps) {
  const t = useTranslations("currencies");
  const [state, formAction, isPending] = useActionState(action, null);
  const formRef = useFocusFirstError(state);
  // After a failed submit the typed values come back with the error.
  const values = state?.values ?? initialValues;

  const errorOf = (field: keyof RateFormValues) =>
    state?.field === field ? state.message : undefined;
  const controlProps = (field: keyof RateFormValues) => ({
    id: field,
    name: field,
    defaultValue: values[field],
    className: CONTROL_CLASS,
  });

  return (
    <form ref={formRef} action={formAction} className="flex max-w-md flex-col gap-4" noValidate>
      <FormField id="date" label={t("form.date")} error={errorOf("date")}>
        <input {...controlProps("date")} type="date" required />
      </FormField>

      <FormField
        id="base"
        label={t("form.base")}
        hint={t("form.baseHint")}
        error={errorOf("base")}
      >
        <input {...controlProps("base")} type="text" maxLength={3} required autoComplete="off" />
      </FormField>

      <FormField
        id="quote"
        label={t("form.quote")}
        hint={t("form.quoteHint")}
        error={errorOf("quote")}
      >
        <input {...controlProps("quote")} type="text" maxLength={3} required autoComplete="off" />
      </FormField>

      <FormField
        id="rate"
        label={t("form.rate")}
        hint={t("form.rateHint")}
        error={errorOf("rate")}
      >
        <input {...controlProps("rate")} type="text" inputMode="decimal" required autoComplete="off" />
      </FormField>

      <Button
        type="submit"
        pending={isPending}
        pendingLabel={t("rateSubmitPending")}
        className="self-start"
      >
        {t("rateSubmit")}
      </Button>
    </form>
  );
}
