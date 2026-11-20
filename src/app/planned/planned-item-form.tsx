"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";

import { Button } from "../../components/button";
import { Checkbox } from "../../components/checkbox";
import { DatePicker } from "../../components/date-picker";
import { Select } from "../../components/select";
import { useIsHydrated } from "../../components/use-is-hydrated";
import { AmountInput } from "../amount-input";
import { CONTROL_CLASS, FormField } from "../form-field";
import { isWholeNumberDraft } from "../../domain/amount-syntax";
import { DraftTextInput } from "../draft-text-input";
import { KindSegments } from "../transactions/kind-segments";
import { useFocusFirstError } from "../use-focus-first-error";
import { AmountModeFields } from "./amount-mode-fields";
import { MatchingFields, ProvisionMatchingNote } from "./matching-fields";
import {
  BUSINESS_DAY_RULES,
  DEFAULT_FORM_KIND,
  ONCE,
  PLANNED_ITEM_FORM_KINDS,
  PROVISION_CHECKED,
  REPETITION_CHOICES,
  repetitionChoiceOf,
  REPETITION_NUMBER_UNIT,
  ROLLING_AVERAGE_MODE,
  TRANSFER_KIND,
  type PlannedItemFormField,
  type PlannedItemFormState,
  type PlannedItemFormValues,
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

const FULL_WIDTH_CLASS = "@min-[640px]:col-span-2";

const MATCHING_FIELDS: readonly PlannedItemFormField[] = ["matchWindowDays", "matchTolerancePercent"];

interface MatchingSettings {
  windowDays: string;
  tolerancePercent: string;
}

const matchingOf = (values: PlannedItemFormValues): MatchingSettings => ({
  windowDays: values.matchWindowDays,
  tolerancePercent: values.matchTolerancePercent,
});

// A control that is not in the form (the matching settings while the note replaces them) keeps its
// previous value.
function matchingOfForm(formData: FormData, previous: MatchingSettings): MatchingSettings {
  const windowDays = formData.get("matchWindowDays");
  const tolerancePercent = formData.get("matchTolerancePercent");
  return {
    windowDays: typeof windowDays === "string" ? windowDays : previous.windowDays,
    tolerancePercent: typeof tolerancePercent === "string" ? tolerancePercent : previous.tolerancePercent,
  };
}

// The server is the authority on what a kind or a repetition means: an unknown value coming back
// from it falls back to the default instead of being refused here.
function formKindOf(value: string): FormKind {
  return PLANNED_ITEM_FORM_KINDS.find((kind) => kind === value) ?? DEFAULT_FORM_KIND;
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
  const [amountMode, setAmountMode] = useState(initialValues.amountMode);
  const [averageWindow, setAverageWindow] = useState(initialValues.averageWindow);
  const [isProvision, setIsProvision] = useState(
    initialValues.acceptsMultipleTransactions === PROVISION_CHECKED,
  );
  // The matching settings are not posted by their own controls while the provision note replaces
  // them: they are kept here so that the server still validates them and unchecking restores them.
  const [matching, setMatching] = useState(() => matchingOf(initialValues));
  // The automatic form reset after an action sends the native controls back to their first state and
  // React does not re-apply an unchanged value: the key remounts the controlled ones after each result.
  const [resultCount, setResultCount] = useState(0);
  const [state, formAction, isPending] = useActionState(
    async (previous: PlannedItemFormState | null, formData: FormData) => {
      const result = await action(previous, formData);
      const values = result?.values ?? initialValues;
      setKind(formKindOf(values.kind));
      setRepetition(repetitionChoiceOf(values.repetition));
      setAmountMode(values.amountMode);
      setAverageWindow(values.averageWindow);
      setIsProvision(values.acceptsMultipleTransactions === PROVISION_CHECKED);
      setMatching(matchingOf(values));
      setResultCount((count) => count + 1);
      return result;
    },
    null,
  );
  const formRef = useFocusFirstError(state);
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

  const isTransfer = kind === TRANSFER_KIND;
  const isRolling = amountMode === ROLLING_AVERAGE_MODE;
  const numberUnit = REPETITION_NUMBER_UNIT[repetition];
  const accountOptions = accounts.map((account) => (
    <option key={account.id} value={account.id}>
      {account.name} ({account.currency})
    </option>
  ));
  // A refusal that no control shows, such as a failed save, is told above the button.
  const isMatchingHidden = isProvision && isHydrated;
  const hasOwnControl =
    state?.field !== undefined &&
    state.field !== "kind" &&
    !(isMatchingHidden && MATCHING_FIELDS.includes(state.field));

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
          {/* Not a controlled `value`: the form reset after an action puts a controlled select back
              on its first option, and only a `defaultValue` (remounted by the key) survives it. */}
          <Select
            key={`repetition-${resultCount}`}
            id="repetition"
            name="repetition"
            defaultValue={repetition}
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
            <DraftTextInput
              id="repetitionValue"
              name="repetitionValue"
              inputMode="numeric"
              isDraft={isWholeNumberDraft}
              refusalMessage="wholeNumberCharacterRefused"
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

        <div className={FULL_WIDTH_CLASS}>
          <AmountModeFields
            key={`amount-mode-${resultCount}`}
            modeId="amountMode"
            windowId="averageWindow"
            mode={amountMode}
            averageWindow={averageWindow}
            onModeChange={setAmountMode}
            onAverageWindowChange={setAverageWindow}
            showWindow={isRolling || !isHydrated}
            modeError={errorOf("amountMode")}
            windowError={errorOf("averageWindow")}
          />
        </div>

        <FormField
          {...fieldProps("amount", isRolling ? t("startingEstimate") : t("amount"))}
          hint={isRolling ? `${t("amountHint")} ${t("startingEstimateHint")}` : t("amountHint")}
        >
          <AmountInput {...controlProps("amount")} className={CONTROL_CLASS} required />
        </FormField>

        <div className={FULL_WIDTH_CLASS}>
          <Checkbox
            key={`provision-${resultCount}`}
            name="acceptsMultipleTransactions"
            value={PROVISION_CHECKED}
            defaultChecked={values.acceptsMultipleTransactions === PROVISION_CHECKED}
            onChange={(event) => {
              const { form } = event.target;
              if (form !== null) {
                setMatching((current) => matchingOfForm(new FormData(form), current));
              }
              setIsProvision(event.target.checked);
            }}
            label={t("provision")}
          />
        </div>

        {isProvision || !isHydrated ? (
          <div className={FULL_WIDTH_CLASS}>
            <FormField
              {...fieldProps("provisionLabelFilter", t("provisionLabelFilter"))}
              optional
              hint={t("provisionLabelFilterHint")}
            >
              <input
                {...controlProps("provisionLabelFilter")}
                className={CONTROL_CLASS}
                type="text"
                autoComplete="off"
              />
            </FormField>
          </div>
        ) : null}

        <div className={FULL_WIDTH_CLASS}>
          {isMatchingHidden ? (
            <>
              <ProvisionMatchingNote />
              <input type="hidden" name="matchWindowDays" value={matching.windowDays} />
              <input type="hidden" name="matchTolerancePercent" value={matching.tolerancePercent} />
            </>
          ) : (
            <MatchingFields
              windowDays={matching.windowDays}
              tolerancePercent={matching.tolerancePercent}
              windowError={errorOf("matchWindowDays")}
              toleranceError={errorOf("matchTolerancePercent")}
            />
          )}
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
