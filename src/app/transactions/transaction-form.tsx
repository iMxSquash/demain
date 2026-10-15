"use client";

import { useActionState } from "react";

import { ENTERED_TRANSACTION_KINDS, PAYMENT_MODES } from "../../domain/transaction";
import { CONTROL_CLASS, FormField } from "../form-field";
import { KIND_LABELS, PAYMENT_MODE_LABELS } from "./labels";
import type {
  TransactionFormField,
  TransactionFormState,
  TransactionFormValues,
} from "./transaction-form-data";

export interface AccountOption {
  id: number;
  name: string;
  currency: string;
}

interface TransactionFormProps {
  action: (
    previous: TransactionFormState | null,
    formData: FormData,
  ) => Promise<TransactionFormState | null>;
  initialValues: TransactionFormValues;
  /** Active accounts only: no transaction can be entered on an archived one. */
  accounts: AccountOption[];
  submitLabel: string;
}

export function TransactionForm({
  action,
  initialValues,
  accounts,
  submitLabel,
}: TransactionFormProps) {
  const [state, formAction, isPending] = useActionState(action, null);
  // After a submit the typed values come back with the result.
  const values = state?.values ?? initialValues;

  const errorOf = (field: TransactionFormField) =>
    state?.status === "error" && state.field === field ? state.message : undefined;
  const controlProps = (field: TransactionFormField) => {
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
    <form action={formAction} className="flex max-w-md flex-col gap-4" noValidate>
      {state?.status === "error" && !state.field ? (
        <p role="alert" className="font-medium text-red-800">
          Error: {state.message}
        </p>
      ) : null}
      {state?.status === "notice" ? (
        <p role="status" className="font-medium">
          {state.message}
        </p>
      ) : null}

      <FormField id="accountId" label="Account" error={errorOf("accountId")}>
        {/* The key remounts the select: after the automatic form reset React
            does not re-apply a changed defaultValue to the options. */}
        <select key={values.accountId} {...controlProps("accountId")}>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name} ({account.currency})
            </option>
          ))}
        </select>
      </FormField>

      <FormField id="date" label="Date" error={errorOf("date")}>
        <input {...controlProps("date")} type="date" required />
      </FormField>

      <FormField id="kind" label="Type" error={errorOf("kind")}>
        <select key={values.kind} {...controlProps("kind")}>
          {ENTERED_TRANSACTION_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {KIND_LABELS[kind]}
            </option>
          ))}
        </select>
      </FormField>

      <FormField
        id="amount"
        label="Amount (without a sign, the type sets the direction)"
        error={errorOf("amount")}
      >
        <input
          {...controlProps("amount")}
          type="text"
          inputMode="decimal"
          required
          autoComplete="off"
        />
      </FormField>

      <FormField id="label" label="Label" error={errorOf("label")}>
        <input {...controlProps("label")} type="text" required autoComplete="off" />
      </FormField>

      <FormField
        id="description"
        label="Note (optional)"
        error={errorOf("description")}
      >
        <input {...controlProps("description")} type="text" autoComplete="off" />
      </FormField>

      <FormField
        id="paymentMode"
        label="Payment mode (optional)"
        error={errorOf("paymentMode")}
      >
        <select key={values.paymentMode} {...controlProps("paymentMode")}>
          <option value="">None</option>
          {PAYMENT_MODES.map((mode) => (
            <option key={mode} value={mode}>
              {PAYMENT_MODE_LABELS[mode]}
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
