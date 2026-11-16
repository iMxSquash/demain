"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { Button } from "../../../../components/button";
import { AmountInput } from "../../../amount-input";
import { BalanceSideField } from "../../../balance-side-field";
import { CONTROL_CLASS, FormField } from "../../../form-field";
import { useFocusFirstError } from "../../../use-focus-first-error";
import type {
  BalanceAssertionFormState,
  BalanceAssertionFormValues,
} from "./balance-assertion-form-data";
import { Select } from "../../../../components/select";

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
  const selectProps = (field: keyof BalanceAssertionFormValues) => ({
    id: field,
    name: field,
    defaultValue: values[field],
  });
  const controlProps = (field: keyof BalanceAssertionFormValues) => ({ ...selectProps(field), className: CONTROL_CLASS });

  return (
    <form ref={formRef} action={formAction} className="flex max-w-md flex-col gap-4" noValidate>
      {accounts === undefined ? null : (
        <FormField
          id="accountId"
          label={t("form.account")}
          error={errorOf("accountId")}
        >
          <Select {...selectProps("accountId")} required>
            <option value="">{t("chooseAccount")}</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </Select>
        </FormField>
      )}

      <FormField id="date" label={t("form.date")} hint={t("form.dateHint")} error={errorOf("date")}>
        <input {...controlProps("date")} type="date" required />
      </FormField>

      <FormField id="amount" label={t("form.amount")} error={errorOf("amount")}>
        <AmountInput {...controlProps("amount")} required />
      </FormField>

      <BalanceSideField name="side" value={values.side} error={errorOf("side")} />

      <FormField id="note" label={t("form.note")} optional>
        <input {...controlProps("note")} type="text" autoComplete="off" />
      </FormField>

      <Button
        type="submit"
        pending={isPending}
        pendingLabel={t("submitPending")}
        className="self-start"
      >
        {t("submit")}
      </Button>
    </form>
  );
}
