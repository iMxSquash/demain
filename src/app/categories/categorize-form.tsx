"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { Button } from "../../components/button";
import { Checkbox } from "../../components/checkbox";
import { Disclosure } from "../../components/disclosure";
import { RULE_OPERATORS } from "../../domain/categorization-rule";
import { CONTROL_CLASS } from "../form-field";
import { useFocusFirstError } from "../use-focus-first-error";
import type { CategorizeState } from "./category-form-data";
import { Select } from "../../components/select";

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
        <Select
          // React ignores a new defaultValue on a mounted select: remount to restore the choice.
          key={state?.values?.categoryId ?? ""}
          id={selectId}
          name="categoryId"
          defaultValue={state?.values?.categoryId ?? ""}
          aria-invalid={state?.field === "category" ? true : undefined}
          aria-describedby={state?.field === "category" ? errorId : undefined}
        >
          <option value="">{t("choose")}</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </Select>
        <Button
          type="submit"
          variant="link"
          pending={isPending}
          pendingLabel={t("categorizePending")}
        >
          {t("categorize")}<span className="sr-only"> {transactionLabel}</span>
        </Button>
      </div>
      <Disclosure summary={t("ruleSummary")} open={state?.field === "rule"}>
        <div className="flex flex-col gap-2 py-1">
          <Checkbox
            name="createRule"
            defaultChecked={state?.values?.createRule ?? false}
            label={t("ruleCreate")}
          />
          <label htmlFor={operatorId}>{rules("operator")}</label>
          <Select
            id={operatorId}
            name="ruleOperator"
            defaultValue={state?.values?.ruleOperator ?? "contains"}
          >
            {RULE_OPERATORS.map((operator) => (
              <option key={operator} value={operator}>
                {rules(`operators.${operator}`)}
              </option>
            ))}
          </Select>
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
      </Disclosure>
      {state ? (
        <p id={errorId} role="alert" className="font-medium text-negative">
          {common("error", { message: state.message })}
        </p>
      ) : null}
    </form>
  );
}
