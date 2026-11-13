"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { RULE_OPERATORS } from "../../domain/categorization-rule";
import { CONTROL_CLASS, FormField } from "../form-field";
import { useFocusFirstError } from "../use-focus-first-error";
import type { RuleFormField, RuleFormState } from "./rule-form-data";

interface RuleFormProps {
  action: (
    previous: RuleFormState | null,
    formData: FormData,
  ) => Promise<RuleFormState | null>;
  /** Active accounts and categories the user may pick. */
  accounts: { id: number; name: string }[];
  categories: { id: number; name: string }[];
}

export function RuleForm({ action, accounts, categories }: RuleFormProps) {
  const t = useTranslations("rules");
  const [state, formAction, isPending] = useActionState(action, null);
  const formRef = useFocusFirstError(state);
  const values = state?.values;
  const errorOf = (field: RuleFormField) =>
    state?.field === field ? state.message : undefined;
  const describedBy = (field: RuleFormField) =>
    errorOf(field) ? `${field}-error` : undefined;

  return (
    <form ref={formRef} action={formAction} className="flex max-w-md flex-col gap-4" noValidate>
      <FormField id="operator" label={t("operator")} error={errorOf("operator")}>
        <select
          id="operator"
          name="operator"
          defaultValue={values?.operator ?? "contains"}
          className={CONTROL_CLASS}
          aria-invalid={errorOf("operator") ? true : undefined}
          aria-describedby={describedBy("operator")}
        >
          {RULE_OPERATORS.map((operator) => (
            <option key={operator} value={operator}>
              {t(`operators.${operator}`)}
            </option>
          ))}
        </select>
      </FormField>

      <FormField id="value" label={t("value")} error={errorOf("value")}>
        <input
          id="value"
          name="value"
          type="text"
          defaultValue={values?.value ?? ""}
          required
          autoComplete="off"
          className={CONTROL_CLASS}
          aria-invalid={errorOf("value") ? true : undefined}
          aria-describedby={describedBy("value")}
        />
      </FormField>

      <FormField id="accountId" label={t("account")} error={errorOf("accountId")}>
        <select
          id="accountId"
          name="accountId"
          defaultValue={values?.accountId ?? ""}
          className={CONTROL_CLASS}
          aria-invalid={errorOf("accountId") ? true : undefined}
          aria-describedby={describedBy("accountId")}
        >
          <option value="">{t("allAccounts")}</option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </select>
      </FormField>

      <FormField id="categoryId" label={t("category")} error={errorOf("categoryId")}>
        <select
          id="categoryId"
          name="categoryId"
          defaultValue={values?.categoryId ?? ""}
          required
          className={CONTROL_CLASS}
          aria-invalid={errorOf("categoryId") ? true : undefined}
          aria-describedby={describedBy("categoryId")}
        >
          <option value="">{t("chooseCategory")}</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </FormField>

      <button
        type="submit"
        disabled={isPending}
        className="min-h-11 self-start rounded-pill bg-primary px-4 font-medium text-on-primary hover:bg-primary-hover disabled:opacity-60"
      >
        {t("addSubmit")}
      </button>
    </form>
  );
}
