"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";

import { Button } from "../../components/button";
import { DatePicker } from "../../components/date-picker";
import { Select } from "../../components/select";
import { useIsHydrated } from "../../components/use-is-hydrated";
import { AmountInput } from "../amount-input";
import { CONTROL_CLASS, FormField } from "../form-field";
import { KindSegments } from "../transactions/kind-segments";
import { useFocusFirstError } from "../use-focus-first-error";
import { WholeNumberInput } from "../whole-number-input";
import { MatchingFields } from "./matching-fields";
import {
  BUSINESS_DAY_RULES,
  PLANNED_ITEM_FORM_KINDS,
  REPETITION_CHOICES,
  REPETITION_NUMBER_UNIT,
  type PlannedItemFormField,
  type PlannedItemFormState,
  type PlannedItemFormValues,
  type RepetitionChoice,
} from "./planned-item-form-data";

export interface PlannedOption {
  id: number;
  name: string;
}

interface PlannedAccountOption extends PlannedOption {
  currency: string;
}

interface PlannedItemFormProps {
  action: (
    previous: PlannedItemFormState | null,
    formData: FormData,
  ) => Promise<PlannedItemFormState | null>;
  initialValues: PlannedItemFormValues;
  /** Active accounts only: archived ones are never offered. */
  accounts: PlannedAccountOption[];
  /** Active categories only. */
  categories: PlannedOption[];
}

type FormKind = (typeof PLANNED_ITEM_FORM_KINDS)[number];

const TRANSFER: FormKind = "transfer";
const ONCE: RepetitionChoice = "once";
const FULL_WIDTH_CLASS = "@min-[640px]:col-span-2";

// The server is the authority on what a kind or a repetition means: an unknown value coming back
// from it falls back to the default instead of being refused here.
function formKindOf(value: string): FormKind {
  return PLANNED_ITEM_FORM_KINDS.find((kind) => kind === value) ?? "expense";
}

function repetitionChoiceOf(value: string): RepetitionChoice {
  return REPETITION_CHOICES.find((choice) => choice === value) ?? "monthly_on_day";
}

/**
 * The create form (DESIGN section 17). The kind and the repetition decide which other fields apply,
 * so they are the two controlled values. Before the page is interactive every field is in the form
 * and the server drops those that do not apply.
 */
export function PlannedItemForm({
  action,
  initialValues,
  accounts,
  categories,
}: PlannedItemFormProps) {
  const t = useTranslations("planned.form");
  const common = useTranslations("common");
  const isHydrated = useIsHydrated();
  const [kind, setKind] = useState(() => formKindOf(initialValues.kind));
  const [repetition, setRepetition] = useState(() => repetitionChoiceOf(initialValues.repetition));
  // The automatic form reset after an action sends the native controls back to their first state and
  // React does not re-apply an unchanged value: the key remounts the controlled ones after each result.
  const [resultCount, setResultCount] = useState(0);
  const [state, formAction, isPending] = useActionState(
    async (previous: PlannedItemFormState | null, formData: FormData) => {
      const result = await action(previous, formData);
      const values = result?.values ?? initialValues;
      setKind(formKindOf(values.kind));
      setRepetition(repetitionChoiceOf(values.repetition));
      setResultCount((count) => count + 1);
      return result;
    },
    null,
  );
  const formRef = useFocusFirstError(state);
  // After a failed submit the typed values come back with the error.
  const values = state?.values ?? initialValues;

  const errorOf = (field: PlannedItemFormField) =>
    state?.field === field ? state.message : undefined;
  const fieldProps = (field: PlannedItemFormField, label: string) => ({
    id: field,
    label,
    error: errorOf(field),
  });
  const controlProps = (field: PlannedItemFormField) => ({
    id: field,
    name: field,
    defaultValue: values[field],
  });

  const isTransfer = kind === TRANSFER;
  const numberUnit = REPETITION_NUMBER_UNIT[repetition];
  const accountOptions = accounts.map((account) => (
    <option key={account.id} value={account.id}>
      {account.name} ({account.currency})
    </option>
  ));
  // A refusal that no control shows, such as a failed save, is told above the button.
  const hasOwnControl = state?.field !== undefined && state.field !== "kind";

  return (
    <div className="@container rounded-card bg-surface p-4 @3xl:p-6">
      <form
        ref={formRef}
        action={formAction}
        noValidate
        className="grid gap-4 @min-[640px]:grid-cols-2"
      >
        <div className={FULL_WIDTH_CLASS}>
          <FormField {...fieldProps("name", t("name"))} hint={t("nameHint")}>
            <input {...controlProps("name")} className={CONTROL_CLASS} type="text" required autoComplete="off" />
          </FormField>
        </div>

        <div className={FULL_WIDTH_CLASS}>
          <KindSegments
            key={`kind-${resultCount}`}
            name="kind"
            legend={t("type")}
            options={PLANNED_ITEM_FORM_KINDS}
            value={kind}
            onChange={setKind}
            labelOf={(option) => t(`kindLabels.${option}`)}
          />
        </div>

        <FormField {...fieldProps("accountId", t("account"))}>
          <Select key={`account-${resultCount}`} {...controlProps("accountId")}>
            {accountOptions}
          </Select>
        </FormField>

        {isTransfer || !isHydrated ? (
          <FormField
            {...fieldProps("destinationAccountId", t("destination"))}
            hint={isHydrated ? undefined : t("destinationHint")}
          >
            <Select key={`destination-${resultCount}`} {...controlProps("destinationAccountId")}>
              {accountOptions}
            </Select>
          </FormField>
        ) : null}

        {isTransfer && isHydrated ? null : (
          <FormField {...fieldProps("categoryId", t("category"))} optional>
            <Select key={`category-${resultCount}`} {...controlProps("categoryId")}>
              <option value="">{common("none")}</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
          </FormField>
        )}

        <FormField {...fieldProps("startDate", t("startDate"))} hint={t("startDateHint")}>
          <DatePicker {...controlProps("startDate")} required />
        </FormField>

        <FormField {...fieldProps("repetition", t("repetition"))}>
          <Select
            key={`repetition-${resultCount}`}
            id="repetition"
            name="repetition"
            value={repetition}
            onChange={(event) => setRepetition(repetitionChoiceOf(event.target.value))}
          >
            {REPETITION_CHOICES.map((choice) => (
              <option key={choice} value={choice}>
                {t(`repetitions.${choice}`)}
              </option>
            ))}
          </Select>
        </FormField>

        {numberUnit !== undefined || !isHydrated ? (
          <FormField
            {...fieldProps(
              "repetitionValue",
              numberUnit === undefined ? t("repetitionValue") : t(`repetitionValues.${numberUnit}`),
            )}
          >
            <WholeNumberInput
              id="repetitionValue"
              name="repetitionValue"
              defaultValue={values.repetitionValue}
              className={CONTROL_CLASS}
            />
          </FormField>
        ) : null}

        {repetition !== ONCE || !isHydrated ? (
          <FormField {...fieldProps("endDate", t("endDate"))} optional hint={t("endDateHint")}>
            <DatePicker {...controlProps("endDate")} />
          </FormField>
        ) : null}

        <FormField
          {...fieldProps("businessDayRule", t("businessDay"))}
          hint={t("businessDayHint")}
        >
          <Select key={`business-day-${resultCount}`} {...controlProps("businessDayRule")}>
            {BUSINESS_DAY_RULES.map((rule) => (
              <option key={rule} value={rule}>
                {t(`businessDayRules.${rule}`)}
              </option>
            ))}
          </Select>
        </FormField>

        <FormField {...fieldProps("amount", t("amount"))} hint={t("amountHint")}>
          <AmountInput {...controlProps("amount")} className={CONTROL_CLASS} required />
        </FormField>

        <div className={FULL_WIDTH_CLASS}>
          <MatchingFields
            windowDays={values.matchWindowDays}
            tolerancePercent={values.matchTolerancePercent}
            windowError={errorOf("matchWindowDays")}
            toleranceError={errorOf("matchTolerancePercent")}
          />
        </div>

        {state !== null && !hasOwnControl ? (
          <p role="alert" className={`${FULL_WIDTH_CLASS} font-medium text-negative`}>
            {common("error", { message: state.message })}
          </p>
        ) : null}

        <Button
          type="submit"
          pending={isPending}
          pendingLabel={common("pending")}
          className={`min-h-13 w-full @min-[640px]:w-auto @min-[640px]:self-start ${FULL_WIDTH_CLASS}`}
        >
          {t(`submit.${kind}`)}
        </Button>
      </form>
    </div>
  );
}
