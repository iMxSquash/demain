"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { Button } from "../../components/button";
import { CONTROL_CLASS, FormField } from "../form-field";
import { useFocusFirstError } from "../use-focus-first-error";
import type { CategoryFormState } from "./category-form-data";

interface CategoryFormProps {
  action: (
    previous: CategoryFormState | null,
    formData: FormData,
  ) => Promise<CategoryFormState | null>;
  initialName: string;
  submitLabel: string;
  /** Adds a Cancel button next to the submit one, for a form shown in a modal. */
  onCancel?: () => void;
}

export function CategoryForm({
  action,
  initialName,
  submitLabel,
  onCancel,
}: CategoryFormProps) {
  const t = useTranslations("categories");
  const common = useTranslations("common");
  const [state, formAction, isPending] = useActionState(action, null);
  const formRef = useFocusFirstError(state);
  const name = state?.name ?? initialName;
  const nameError = state?.field === "name" ? state.message : undefined;

  return (
    <form ref={formRef} action={formAction} className="flex max-w-md flex-col gap-4" noValidate>
      <FormField id="name" label={t("name")} error={nameError}>
        <input
          id="name"
          name="name"
          type="text"
          defaultValue={name}
          required
          autoComplete="off"
          className={CONTROL_CLASS}
        />
      </FormField>

      <div className="flex gap-2">
        <Button type="submit" pending={isPending} pendingLabel={common("pending")}>
          {submitLabel}
        </Button>
        {onCancel ? (
          <Button type="button" variant="secondary" onClick={onCancel}>
            {common("cancel")}
          </Button>
        ) : null}
      </div>
    </form>
  );
}
