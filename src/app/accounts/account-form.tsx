"use client";

import { useActionState, type ReactNode } from "react";

import { ACCOUNT_KINDS, type AccountField } from "../../domain/account";
import type {
  AccountFormState,
  AccountFormValues,
} from "./account-form-data";

export interface OverflowOption {
  id: number;
  name: string;
  currency: string;
}

interface AccountFormProps {
  action: (
    previous: AccountFormState | null,
    formData: FormData,
  ) => Promise<AccountFormState | null>;
  initialValues: AccountFormValues;
  /** Active accounts the user may pick as overflow account (never the account itself). */
  overflowOptions: OverflowOption[];
  submitLabel: string;
}

const KIND_LABELS: Record<(typeof ACCOUNT_KINDS)[number], string> = {
  checking: "Checking",
  savings: "Savings",
  other: "Other",
};

const CONTROL_CLASS =
  "min-h-11 w-full rounded border border-neutral-500 bg-white px-3 text-neutral-900 aria-[invalid=true]:border-2 aria-[invalid=true]:border-red-800";

export function AccountForm({
  action,
  initialValues,
  overflowOptions,
  submitLabel,
}: AccountFormProps) {
  const [state, formAction, isPending] = useActionState(action, null);
  // After a failed submit the typed values come back with the error.
  const values = state?.values ?? initialValues;

  const errorOf = (field: AccountField) =>
    state?.field === field ? state.message : undefined;
  const controlProps = (field: AccountField) => {
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
  const fieldProps = (field: AccountField, label: string) => ({
    field,
    label,
    error: errorOf(field),
  });

  return (
    <form action={formAction} className="flex max-w-md flex-col gap-4" noValidate>
      {state && !state.field ? (
        <p role="alert" className="font-medium text-red-800">
          Error: {state.message}
        </p>
      ) : null}

      <Field {...fieldProps("name", "Name")}>
        <input {...controlProps("name")} type="text" required autoComplete="off" />
      </Field>

      <Field {...fieldProps("kind", "Kind")}>
        {/* The key remounts the select: after the automatic form reset React
            does not re-apply a changed defaultValue to the options. */}
        <select key={values.kind} {...controlProps("kind")}>
          {ACCOUNT_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {KIND_LABELS[kind]}
            </option>
          ))}
        </select>
      </Field>

      <Field
        {...fieldProps("currency", "Currency (ISO 4217 code, for example EUR)")}
      >
        <input
          {...controlProps("currency")}
          type="text"
          required
          autoComplete="off"
          maxLength={3}
        />
      </Field>

      <Field {...fieldProps("openingDate", "Opening date")}>
        <input {...controlProps("openingDate")} type="date" required />
      </Field>

      <Field {...fieldProps("openingBalance", "Opening balance")}>
        <input
          {...controlProps("openingBalance")}
          type="text"
          inputMode="decimal"
          required
          autoComplete="off"
        />
      </Field>

      <Field
        {...fieldProps(
          "depositCeiling",
          "Deposit ceiling (optional, leave empty for none)",
        )}
      >
        <input
          {...controlProps("depositCeiling")}
          type="text"
          inputMode="decimal"
          autoComplete="off"
        />
      </Field>

      <Field {...fieldProps("overflowAccountId", "Overflow account (optional)")}>
        {/* Same remount trick as the kind select above. */}
        <select
          key={values.overflowAccountId}
          {...controlProps("overflowAccountId")}
        >
          <option value="">None</option>
          {overflowOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name} ({option.currency})
            </option>
          ))}
        </select>
      </Field>

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

interface FieldProps {
  field: AccountField;
  label: string;
  error: string | undefined;
  children: ReactNode;
}

function Field({ field, label, error, children }: FieldProps) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={field}>{label}</label>
      {children}
      {error ? (
        <p id={`${field}-error`} className="font-medium text-red-800">
          Error: {error}
        </p>
      ) : null}
    </div>
  );
}
