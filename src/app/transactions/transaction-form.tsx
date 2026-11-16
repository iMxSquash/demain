"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { Button } from "../../components/button";
import { ENTERED_TRANSACTION_KINDS, PAYMENT_MODES } from "../../domain/transaction";
import { AmountInput } from "../amount-input";
import { CONTROL_CLASS, FormField } from "../form-field";
import { useFocusFirstError } from "../use-focus-first-error";
import type {
  TransactionFormField,
  TransactionFormState,
  TransactionFormValues,
} from "./transaction-form-data";
import { Select } from "../../components/select";

export interface AccountOption {
  id: number;
  name: string;
  currency: string;
}

export interface CategoryOption {
  id: number;
  name: string;
}

interface TransactionFormProps {
  action: (
    previous: TransactionFormState | null,
    formData: FormData,
  ) => Promise<TransactionFormState | null>;
  initialValues: TransactionFormValues;
  /** Active accounts only: no transaction can be entered on an archived one. */
  accounts: AccountOption[];
  /** Active categories, plus the one the transaction already has if archived. */
  categories: CategoryOption[];
  submitLabel: string;
}

export function TransactionForm({
  action,
  initialValues,
  accounts,
  categories,
  submitLabel,
}: TransactionFormProps) {
  const t = useTranslations("transactions");
  const common = useTranslations("common");
  const [state, formAction, isPending] = useActionState(action, null);
  const formRef = useFocusFirstError(state);
  // After a submit the typed values come back with the result.
  const values = state?.values ?? initialValues;

  const errorOf = (field: TransactionFormField) =>
    state?.status === "error" && state.field === field ? state.message : undefined;
  const controlProps = (field: TransactionFormField) => ({
    id: field,
    name: field,
    defaultValue: values[field],
    className: CONTROL_CLASS,
  });

  return (
    <form ref={formRef} action={formAction} className="flex max-w-md flex-col gap-4" noValidate>
      {state?.status === "notice" ? (
        <p role="status" className="font-medium">
          {state.message}
        </p>
      ) : null}

      <FormField
        id="accountId"
        label={t("form.account")}
        error={errorOf("accountId")}
      >
        {/* The key remounts the select: after the automatic form reset React
            does not re-apply a changed defaultValue to the options. */}
        <Select key={values.accountId} {...controlProps("accountId")}>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name} ({account.currency})
            </option>
          ))}
        </Select>
      </FormField>

      <FormField id="date" label={t("form.date")} error={errorOf("date")}>
        <input {...controlProps("date")} type="date" required />
      </FormField>

      <FormField id="kind" label={t("form.type")} error={errorOf("kind")}>
        <Select key={values.kind} {...controlProps("kind")}>
          {ENTERED_TRANSACTION_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {t(`kinds.${kind}`)}
            </option>
          ))}
        </Select>
      </FormField>

      <FormField
        id="amount"
        label={t("form.amount")}
        hint={t("form.amountHint")}
        error={errorOf("amount")}
      >
        <AmountInput {...controlProps("amount")} required />
      </FormField>

      <FormField id="label" label={t("form.label")} error={errorOf("label")}>
        <input {...controlProps("label")} type="text" required autoComplete="off" />
      </FormField>

      <FormField
        id="description"
        label={t("form.note")}
        optional
        error={errorOf("description")}
      >
        <input {...controlProps("description")} type="text" autoComplete="off" />
      </FormField>

      <FormField
        id="categoryId"
        label={t("form.category")}
        optional
        hint={t("form.categoryHint")}
        error={errorOf("categoryId")}
      >
        <Select key={values.categoryId} {...controlProps("categoryId")}>
          <option value="">{common("none")}</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </Select>
      </FormField>

      <FormField
        id="paymentMode"
        label={t("form.paymentMode")}
        optional
        error={errorOf("paymentMode")}
      >
        <Select key={values.paymentMode} {...controlProps("paymentMode")}>
          <option value="">{common("none")}</option>
          {PAYMENT_MODES.map((mode) => (
            <option key={mode} value={mode}>
              {t(`paymentModes.${mode}`)}
            </option>
          ))}
        </Select>
      </FormField>

      <Button
        type="submit"
        pending={isPending}
        pendingLabel={common("pending")}
        className="self-start"
      >
        {submitLabel}
      </Button>
    </form>
  );
}
