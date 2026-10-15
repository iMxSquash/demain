"use client";

import { useActionState } from "react";

import { ACCOUNT_KINDS, type AccountField } from "../../domain/account";
import { CONTROL_CLASS, FormField } from "../form-field";
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
    id: field,
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

      <FormField {...fieldProps("name", "Name")}>
        <input {...controlProps("name")} type="text" required autoComplete="off" />
      </FormField>

      <FormField {...fieldProps("kind", "Kind")}>
        {/* The key remounts the select: after the automatic form reset React
            does not re-apply a changed defaultValue to the options. */}
        <select key={values.kind} {...controlProps("kind")}>
          {ACCOUNT_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {KIND_LABELS[kind]}
            </option>
          ))}
        </select>
      </FormField>

      <FormField
        {...fieldProps("currency", "Currency (ISO 4217 code, for example EUR)")}
      >
        <input
          {...controlProps("currency")}
          type="text"
          required
          autoComplete="off"
          maxLength={3}
        />
      </FormField>

      <FormField {...fieldProps("openingDate", "Opening date")}>
        <input {...controlProps("openingDate")} type="date" required />
      </FormField>

      <FormField {...fieldProps("openingBalance", "Opening balance")}>
        <input
          {...controlProps("openingBalance")}
          type="text"
          inputMode="decimal"
          required
          autoComplete="off"
        />
      </FormField>

      <FormField
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
      </FormField>

      <FormField {...fieldProps("overflowAccountId", "Overflow account (optional)")}>
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
