"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { Button } from "../../components/button";
import { CONTROL_CLASS, FormField } from "../form-field";
import { useFocusFirstError } from "../use-focus-first-error";
import type { ReferenceCurrencyFormState } from "./currency-form-data";

interface ReferenceCurrencyFormProps {
  action: (
    previous: ReferenceCurrencyFormState | null,
    formData: FormData,
  ) => Promise<ReferenceCurrencyFormState | null>;
  currentCurrency: string;
}

export function ReferenceCurrencyForm({
  action,
  currentCurrency,
}: ReferenceCurrencyFormProps) {
  const t = useTranslations("currencies");
  const [state, formAction, isPending] = useActionState(action, null);
  const formRef = useFocusFirstError(state);

  return (
    <form ref={formRef} action={formAction} className="flex max-w-md flex-col gap-4" noValidate>
      <FormField
        id="currency"
        label={t("referenceLabel")}
        hint={t("referenceHint")}
        error={state?.message}
      >
        <input
          id="currency"
          name="currency"
          type="text"
          defaultValue={state?.value ?? currentCurrency}
          className={CONTROL_CLASS}
          maxLength={3}
          required
          autoComplete="off"
        />
      </FormField>
      <Button
        type="submit"
        pending={isPending}
        pendingLabel={t("referenceSubmitPending")}
        className="self-start"
      >
        {t("referenceSubmit")}
      </Button>
    </form>
  );
}
