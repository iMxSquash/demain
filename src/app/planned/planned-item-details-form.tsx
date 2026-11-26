"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { Button } from "../../components/button";
import { Select } from "../../components/select";
import { CONTROL_CLASS, FormField } from "../form-field";
import { useFocusFirstError } from "../use-focus-first-error";
import { MatchingFields, ProvisionMatchingNote } from "./matching-fields";
import type { PlannedOption } from "./planned-item-form";
import type {
  PlannedItemDetailsFormField,
  PlannedItemDetailsFormState,
  PlannedItemDetailsFormValues,
} from "./planned-item-form-data";

interface PlannedItemDetailsFormProps {
  action: (
    previous: PlannedItemDetailsFormState | null,
    formData: FormData,
  ) => Promise<PlannedItemDetailsFormState | null>;
  initialValues: PlannedItemDetailsFormValues;
  /** Active categories only. */
  categories: PlannedOption[];
  /** A transfer has no category: the field is not offered. */
  hasCategory: boolean;
  /** A provision has a label filter and no matching settings; it cannot become one later. */
  isProvision: boolean;
}

/** The details of a planned item that change without a new version. */
export function PlannedItemDetailsForm({
  action,
  initialValues,
  categories,
  hasCategory,
  isProvision,
}: PlannedItemDetailsFormProps) {
  const t = useTranslations("planned");
  const common = useTranslations("common");
  const [state, formAction, isPending] = useActionState(action, null);
  const formRef = useFocusFirstError(state);
  const values = state?.values ?? initialValues;

  const errorOf = (field: PlannedItemDetailsFormField) =>
    state?.field === field ? state.message : undefined;

  return (
    <form
      ref={formRef}
      action={formAction}
      noValidate
      className="@container flex max-w-md flex-col gap-4"
    >
      <FormField id="name" label={t("form.name")} error={errorOf("name")}>
        <input
          id="name"
          name="name"
          defaultValue={values.name}
          className={CONTROL_CLASS}
          type="text"
          required
          autoComplete="off"
        />
      </FormField>

      {hasCategory ? (
        <FormField
          id="categoryId"
          label={t("form.category")}
          optional
          error={errorOf("categoryId")}
        >
          {/* The key remounts the select: after the automatic form reset React does not
              re-apply a changed defaultValue to the options. */}
          <Select
            key={values.categoryId}
            id="categoryId"
            name="categoryId"
            defaultValue={values.categoryId}
          >
            <option value="">{common("none")}</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>
        </FormField>
      ) : null}

      {isProvision ? (
        <>
          <FormField
            id="provisionLabelFilter"
            label={t("form.provisionLabelFilter")}
            optional
            hint={t("form.provisionLabelFilterHint")}
            error={errorOf("provisionLabelFilter")}
          >
            <input
              id="provisionLabelFilter"
              name="provisionLabelFilter"
              defaultValue={values.provisionLabelFilter}
              className={CONTROL_CLASS}
              type="text"
              autoComplete="off"
            />
          </FormField>
          <ProvisionMatchingNote />
          {/* The settings do not apply to a provision: the stored ones are sent back unchanged. */}
          <input type="hidden" name="matchWindowDays" value={values.matchWindowDays} />
          <input type="hidden" name="matchTolerancePercent" value={values.matchTolerancePercent} />
        </>
      ) : (
        <MatchingFields
          windowDays={values.matchWindowDays}
          tolerancePercent={values.matchTolerancePercent}
          windowError={errorOf("matchWindowDays")}
          toleranceError={errorOf("matchTolerancePercent")}
        />
      )}

      {/* A refusal that no control shows, such as a failed save, is told above the button. */}
      {state !== null && state.field === undefined ? (
        <p role="alert" className="font-medium text-negative">
          {common("error", { message: state.message })}
        </p>
      ) : null}

      <Button
        type="submit"
        pending={isPending}
        pendingLabel={common("pending")}
        className="self-start"
      >
        {t("saveDetails")}
      </Button>
    </form>
  );
}
