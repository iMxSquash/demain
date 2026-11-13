"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { ACCOUNT_KINDS, type AccountField } from "../../domain/account";
import { CONTROL_CLASS, FormField } from "../form-field";
import { useFocusFirstError } from "../use-focus-first-error";
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
  /** Active savings accounts the user may pick as overflow account (never the account itself). */
  overflowOptions: OverflowOption[];
  submitLabel: string;
}

export function AccountForm({
  action,
  initialValues,
  overflowOptions,
  submitLabel,
}: AccountFormProps) {
  const t = useTranslations("accounts");
  const common = useTranslations("common");
  const [state, formAction, isPending] = useActionState(action, null);
  const formRef = useFocusFirstError(state);
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
    <form ref={formRef} action={formAction} className="flex max-w-md flex-col gap-4" noValidate>
      <FormField {...fieldProps("name", t("form.name"))}>
        <input {...controlProps("name")} type="text" required autoComplete="off" />
      </FormField>

      <FormField {...fieldProps("kind", t("form.kind"))}>
        {/* The key remounts the select: after the automatic form reset React
            does not re-apply a changed defaultValue to the options. */}
        <select key={values.kind} {...controlProps("kind")}>
          {ACCOUNT_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {t(`kinds.${kind}`)}
            </option>
          ))}
        </select>
      </FormField>

      <FormField {...fieldProps("currency", t("form.currency"))}>
        <input
          {...controlProps("currency")}
          type="text"
          required
          autoComplete="off"
          maxLength={3}
        />
      </FormField>

      <FormField {...fieldProps("openingDate", t("form.openingDate"))}>
        <input {...controlProps("openingDate")} type="date" required />
      </FormField>

      <FormField {...fieldProps("openingBalance", t("form.openingBalance"))}>
        <input
          {...controlProps("openingBalance")}
          type="text"
          inputMode="decimal"
          required
          autoComplete="off"
        />
      </FormField>

      <FormField
        {...fieldProps("depositCeiling", t("form.depositCeiling"))}
      >
        <input
          {...controlProps("depositCeiling")}
          type="text"
          inputMode="decimal"
          autoComplete="off"
        />
      </FormField>

      <FormField {...fieldProps("overflowAccountId", t("form.overflowAccount"))}>
        {/* Same remount trick as the kind select above. */}
        <select
          key={values.overflowAccountId}
          {...controlProps("overflowAccountId")}
        >
          <option value="">{common("none")}</option>
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
        className="min-h-11 self-start rounded-pill bg-primary px-4 font-medium text-on-primary hover:bg-primary-hover disabled:opacity-60"
      >
        {submitLabel}
      </button>
    </form>
  );
}
