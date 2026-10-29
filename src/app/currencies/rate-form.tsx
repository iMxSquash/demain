"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";

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
  const common = useTranslations("common");
  const [state, formAction, isPending] = useActionState(action, null);
  const formRef = useFocusFirstError(state);
  // After a failed submit the typed values come back with the error.
  const values = state?.values ?? initialValues;

  const errorOf = (field: keyof RateFormValues) =>
    state?.field === field ? state.message : undefined;
  const controlProps = (field: keyof RateFormValues) => {
    const hasError = errorOf(field) !== undefined;
    return {
      id: field,
      name: field,
      defaultValue: values[field],
      className: CONTROL_CLASS,
      "aria-invalid": hasError ? true : undefined,
      "aria-describedby": hasError ? `${field}-error` : undefined,
    };
  };

  return (
    <form ref={formRef} action={formAction} className="flex max-w-md flex-col gap-4" noValidate>
      {state && !state.field ? (
        <p role="alert" className="font-medium text-red-800">
          {common("error", { message: state.message })}
        </p>
      ) : null}

      <FormField id="date" label={t("form.date")} error={errorOf("date")}>
        <input {...controlProps("date")} type="date" required />
      </FormField>

      <FormField id="base" label={t("form.base")} error={errorOf("base")}>
        <input {...controlProps("base")} type="text" maxLength={3} required autoComplete="off" />
      </FormField>

      <FormField id="quote" label={t("form.quote")} error={errorOf("quote")}>
        <input {...controlProps("quote")} type="text" maxLength={3} required autoComplete="off" />
      </FormField>

      <FormField id="rate" label={t("form.rate")} error={errorOf("rate")}>
        <input {...controlProps("rate")} type="text" inputMode="decimal" required autoComplete="off" />
      </FormField>

      <button
        type="submit"
        disabled={isPending}
        className="min-h-11 self-start rounded bg-blue-800 px-4 font-medium text-white disabled:opacity-60"
      >
        {t("rateSubmit")}
      </button>
    </form>
  );
}
