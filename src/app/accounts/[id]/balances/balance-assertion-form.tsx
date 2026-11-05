"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { CONTROL_CLASS, FormField } from "../../../form-field";
import { useFocusFirstError } from "../../../use-focus-first-error";
import type {
  BalanceAssertionFormState,
  BalanceAssertionFormValues,
} from "./balance-assertion-form-data";

interface BalanceAssertionFormProps {
  action: (
    previous: BalanceAssertionFormState | null,
    formData: FormData,
  ) => Promise<BalanceAssertionFormState | null>;
  initialValues: BalanceAssertionFormValues;
  /** Offers a selector when the account is not already given by the route. */
  accounts?: readonly { id: number; name: string }[];
}

export function BalanceAssertionForm({
  action,
  initialValues,
  accounts,
}: BalanceAssertionFormProps) {
  const t = useTranslations("balances");
  const [state, formAction, isPending] = useActionState(action, null);
  const formRef = useFocusFirstError(state);
  // After a failed submit the typed values come back with the error.
  const values = state?.values ?? initialValues;

  const errorOf = (field: keyof BalanceAssertionFormValues) =>
    state?.field === field ? state.message : undefined;
  const controlProps = (field: keyof BalanceAssertionFormValues) => {
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
      {accounts === undefined ? null : (
        <FormField
          id="accountId"
          label={t("form.account")}
          error={errorOf("accountId")}
        >
          <select {...controlProps("accountId")} required>
            <option value="">{t("chooseAccount")}</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </FormField>
      )}

      <FormField id="date" label={t("form.date")} error={errorOf("date")}>
        <input {...controlProps("date")} type="date" required />
      </FormField>

      <FormField id="amount" label={t("form.amount")} error={errorOf("amount")}>
        <input
          {...controlProps("amount")}
          type="text"
          inputMode="decimal"
          required
          autoComplete="off"
        />
      </FormField>

      <FormField id="note" label={t("form.note")}>
        <input {...controlProps("note")} type="text" autoComplete="off" />
      </FormField>

      <button
        type="submit"
        disabled={isPending}
        className="min-h-11 self-start rounded bg-blue-800 px-4 font-medium text-white disabled:opacity-60"
      >
        {t("submit")}
      </button>
    </form>
  );
}
