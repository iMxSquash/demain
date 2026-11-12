"use client";

import { useActionState } from "react";

import { CONTROL_CLASS, FormField } from "../form-field";
import type { AuthFormAction } from "./auth-form-data";

export interface AuthFormField {
  name: string;
  label: string;
  type: "text" | "password";
  autoComplete: string;
}

interface AuthFormProps {
  action: AuthFormAction;
  fields: AuthFormField[];
  submitLabel: string;
  /** Values the form must send back unchanged, such as a secret being enrolled. */
  hidden?: Record<string, string>;
}

/**
 * One form for every credential screen. Errors are deliberately not tied to a
 * field: the server never says which part of a credential was wrong, and tells
 * the refusal in a toast.
 */
export function AuthForm({ action, fields, submitLabel, hidden = {} }: AuthFormProps) {
  const [, formAction, isPending] = useActionState(action, null);

  return (
    <form action={formAction} className="flex max-w-md flex-col gap-4" noValidate>
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}

      {fields.map((field, index) => (
        <FormField key={field.name} id={field.name} label={field.label}>
          <input
            id={field.name}
            name={field.name}
            type={field.type}
            required
            // The values are credentials: never kept across a failed submit.
            defaultValue=""
            autoComplete={field.autoComplete}
            autoFocus={index === 0}
            spellCheck={false}
            className={CONTROL_CLASS}
          />
        </FormField>
      ))}

      <button
        type="submit"
        disabled={isPending}
        className="min-h-11 self-start rounded-pill bg-primary px-4 font-medium text-on-primary hover:bg-primary-hover disabled:opacity-60"
      >
        {submitLabel}
      </button>
    </form>
  );
}
