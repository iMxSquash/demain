"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { Button } from "../../components/button";
import { DatePicker } from "../../components/date-picker";
import { FormField } from "../form-field";
import { useFocusFirstError } from "../use-focus-first-error";
import type {
  PlannedItemEndDateFormState,
  PlannedItemEndDateFormValues,
} from "./planned-item-form-data";

interface PlannedItemEndDateFormProps {
  action: (
    previous: PlannedItemEndDateFormState | null,
    formData: FormData,
  ) => Promise<PlannedItemEndDateFormState | null>;
  initialValues: PlannedItemEndDateFormValues;
}

/** Sets the last date a repeating planned item can fall on, or clears it when left empty. */
export function PlannedItemEndDateForm({ action, initialValues }: PlannedItemEndDateFormProps) {
  const t = useTranslations("planned.endDateForm");
  const common = useTranslations("common");
  const [state, formAction, isPending] = useActionState(action, null);
  const formRef = useFocusFirstError(state);
  const values = state?.values ?? initialValues;

  return (
    <form ref={formRef} action={formAction} noValidate className="flex max-w-md flex-col gap-4">
      <FormField
        id="endDate"
        label={t("endDate")}
        optional
        hint={t("hint")}
        error={state?.field === "endDate" ? state.message : undefined}
      >
        <DatePicker id="endDate" name="endDate" defaultValue={values.endDate} />
      </FormField>

      {/* A refusal that no control shows, such as a failed save, is told above the button. */}
      {state !== null && state.field === undefined ? (
        <p role="alert" className="font-medium text-negative">
          {common("error", { message: state.message })}
        </p>
      ) : null}

      <Button
        type="submit"
        pending={isPending}
        pendingLabel={common("pending")}
        className="self-start"
      >
        {t("submit")}
      </Button>
    </form>
  );
}
