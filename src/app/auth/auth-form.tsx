"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { CONTROL_CLASS, FormField } from "../form-field";
import type { AuthFormState } from "./auth-form-data";

export interface AuthFormField {
  name: string;
  label: string;
  type: "text" | "password";
  autoComplete: string;
}

interface AuthFormProps {
  action: (previous: AuthFormState | null, formData: FormData) => Promise<AuthFormState | null>;
  fields: AuthFormField[];
  submitLabel: string;
  /** Values the form must send back unchanged, such as a secret being enrolled. */
  hidden?: Record<string, string>;
}

/**
 * One form for every credential screen. Errors are deliberately not tied to a
 * field: the server never says which part of a credential was wrong.
 */
export function AuthForm({ action, fields, submitLabel, hidden = {} }: AuthFormProps) {
  const common = useTranslations("common");
  const [state, formAction, isPending] = useActionState(action, null);

  return (
    <form action={formAction} className="flex max-w-md flex-col gap-4" noValidate>
      {state ? (
        <p role="alert" className="font-medium text-red-800">
          {common("error", { message: state.message })}
        </p>
      ) : null}

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
        className="min-h-11 self-start rounded bg-blue-800 px-4 font-medium text-white disabled:opacity-60"
      >
        {submitLabel}
      </button>
    </form>
  );
}
