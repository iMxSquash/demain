"use client";

import { useActionState } from "react";

import { CONTROL_CLASS, FormField } from "../form-field";
import type { CategoryFormState } from "./category-form-data";

interface CategoryFormProps {
  action: (
    previous: CategoryFormState | null,
    formData: FormData,
  ) => Promise<CategoryFormState | null>;
  initialName: string;
  submitLabel: string;
}

export function CategoryForm({
  action,
  initialName,
  submitLabel,
}: CategoryFormProps) {
  const [state, formAction, isPending] = useActionState(action, null);
  const name = state?.name ?? initialName;
  const nameError = state?.field === "name" ? state.message : undefined;

  return (
    <form action={formAction} className="flex max-w-md flex-col gap-4" noValidate>
      {state && !state.field ? (
        <p role="alert" className="font-medium text-red-800">
          Error: {state.message}
        </p>
      ) : null}

      <FormField id="name" label="Name" error={nameError}>
        <input
          id="name"
          name="name"
          type="text"
          defaultValue={name}
          required
          autoComplete="off"
          className={CONTROL_CLASS}
          aria-invalid={nameError ? true : undefined}
          aria-describedby={nameError ? "name-error" : undefined}
        />
      </FormField>

      <button
        type="submit"
        disabled={isPending}
        className="min-h-11 self-start rounded bg-blue-800 px-4 font-medium text-white disabled:opacity-60"
      >
        {submitLabel}
      </button>
    </form>
  );
}
