"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { RULE_OPERATORS } from "../../domain/categorization-rule";
import { CONTROL_CLASS } from "../form-field";
import { useFocusFirstError } from "../use-focus-first-error";
import type { CategorizeState } from "./category-form-data";

interface CategorizeFormProps {
  action: (
    previous: CategorizeState | null,
    formData: FormData,
  ) => Promise<CategorizeState | null>;
  /** Label of the transaction, to name the controls for screen readers. */
  transactionLabel: string;
  /** Unique per row: the queue shows many of these forms on one page. */
  idPrefix: string;
  categories: { id: number; name: string }[];
}

export function CategorizeForm({
  action,
  transactionLabel,
  idPrefix,
  categories,
}: CategorizeFormProps) {
  const t = useTranslations("categories");
  const rules = useTranslations("rules");
  const common = useTranslations("common");
  const [state, formAction, isPending] = useActionState(action, null);
  const formRef = useFocusFirstError(state);
  const selectId = `${idPrefix}-category`;
  const errorId = `${idPrefix}-error`;
  const operatorId = `${idPrefix}-rule-operator`;
  const valueId = `${idPrefix}-rule-value`;

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-1">
      <div className="flex gap-2">
        <label htmlFor={selectId} className="sr-only">
          {t("categoryFor", { transaction: transactionLabel })}
        </label>
        <select
          // React ignores a new defaultValue on a mounted select: remount to restore the choice.
          key={state?.values?.categoryId ?? ""}
          id={selectId}
          name="categoryId"
          defaultValue={state?.values?.categoryId ?? ""}
          className={CONTROL_CLASS}
          aria-invalid={state?.field === "category" ? true : undefined}
          aria-describedby={state?.field === "category" ? errorId : undefined}
        >
          <option value="">{t("choose")}</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={isPending}
          className="min-h-11 px-2 underline disabled:opacity-60"
        >
          {t("categorize")}<span className="sr-only"> {transactionLabel}</span>
        </button>
      </div>
      <details open={state?.field === "rule" ? true : undefined}>
        <summary className="inline-flex min-h-11 cursor-pointer items-center">
          {t("ruleSummary")}
        </summary>
        <div className="flex flex-col gap-2 py-1">
          <label className="inline-flex min-h-11 items-center gap-2">
            <input
              type="checkbox"
              name="createRule"
              defaultChecked={state?.values?.createRule ?? false}
              className="size-5"
            />
            {t("ruleCreate")}
          </label>
          <label htmlFor={operatorId}>{rules("operator")}</label>
          <select
            id={operatorId}
            name="ruleOperator"
            defaultValue={state?.values?.ruleOperator ?? "contains"}
            className={CONTROL_CLASS}
          >
            {RULE_OPERATORS.map((operator) => (
              <option key={operator} value={operator}>
                {rules(`operators.${operator}`)}
              </option>
            ))}
          </select>
          <label htmlFor={valueId}>{rules("value")}</label>
          <input
            id={valueId}
            name="ruleValue"
            defaultValue={state?.values?.ruleValue ?? transactionLabel}
            className={CONTROL_CLASS}
            aria-invalid={state?.field === "rule" ? true : undefined}
            aria-describedby={state?.field === "rule" ? errorId : undefined}
          />
        </div>
      </details>
      {state ? (
        <p id={errorId} role="alert" className="font-medium text-red-800">
          {common("error", { message: state.message })}
        </p>
      ) : null}
    </form>
  );
}
