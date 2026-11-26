"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";

import { Button } from "../../components/button";
import { DatePicker } from "../../components/date-picker";
import { Select } from "../../components/select";
import { useIsHydrated } from "../../components/use-is-hydrated";
import { isWholeNumberDraft } from "../../domain/amount-syntax";
import { AmountInput } from "../amount-input";
import { DraftTextInput } from "../draft-text-input";
import { CONTROL_CLASS, FormField } from "../form-field";
import { useFocusFirstError } from "../use-focus-first-error";
import { AmountModeFields } from "./amount-mode-fields";
import {
  BUSINESS_DAY_RULES,
  ONCE,
  REPETITION_CHOICES,
  repetitionChoiceOf,
  REPETITION_NUMBER_UNIT,
  ROLLING_AVERAGE_MODE,
  type PlannedItemVersionFormField,
  type PlannedItemVersionFormState,
  type PlannedItemVersionFormValues,
} from "./planned-item-form-data";

interface PlannedItemVersionFormProps {
  action: (
    previous: PlannedItemVersionFormState | null,
    formData: FormData,
  ) => Promise<PlannedItemVersionFormState | null>;
  /** The version in effect today, with an empty effective date. */
  initialValues: PlannedItemVersionFormValues;
  /** A one-off event cannot start to repeat: the repetition is not offered. */
  isOneOff: boolean;
}

// The ids differ from the names the server reads, so that no id repeats on the edit page.
const ID_OF: Record<PlannedItemVersionFormField, string> = {
  effectiveFrom: "versionEffectiveFrom",
  repetition: "versionRepetition",
  repetitionValue: "versionRepetitionValue",
  businessDayRule: "versionBusinessDayRule",
  amount: "versionAmount",
  amountMode: "versionAmountMode",
  averageWindow: "versionAverageWindow",
};

/** Changes the amount and the schedule of a planned item from a date, as a new version. */
export function PlannedItemVersionForm({
  action,
  initialValues,
  isOneOff,
}: PlannedItemVersionFormProps) {
  const t = useTranslations("planned.form");
  const versionT = useTranslations("planned.versionForm");
  const common = useTranslations("common");
  const isHydrated = useIsHydrated();
  const [repetition, setRepetition] = useState(() => repetitionChoiceOf(initialValues.repetition));
  const [amountMode, setAmountMode] = useState(initialValues.amountMode);
  const [averageWindow, setAverageWindow] = useState(initialValues.averageWindow);
  // The automatic form reset after an action sends the native controls back to their first state and
  // React does not re-apply an unchanged value: the key remounts the controlled ones after each result.
  const [resultCount, setResultCount] = useState(0);
  const [state, formAction, isPending] = useActionState(
    async (previous: PlannedItemVersionFormState | null, formData: FormData) => {
      const result = await action(previous, formData);
      const values = result?.values ?? initialValues;
      setRepetition(repetitionChoiceOf(values.repetition));
      setAmountMode(values.amountMode);
      setAverageWindow(values.averageWindow);
      setResultCount((count) => count + 1);
      return result;
    },
    null,
  );
  const formRef = useFocusFirstError(state);
  const values = state?.values ?? initialValues;

  const fieldProps = (field: PlannedItemVersionFormField, label: string) => ({
    id: ID_OF[field],
    label,
    error: state?.field === field ? state.message : undefined,
  });
  const controlProps = (field: PlannedItemVersionFormField) => ({
    id: ID_OF[field],
    name: field,
    defaultValue: values[field],
  });

  const isRolling = amountMode === ROLLING_AVERAGE_MODE;
  const numberUnit = REPETITION_NUMBER_UNIT[repetition];
  const hasOwnControl = state?.field !== undefined && !(isOneOff && state.field === "repetition");

  return (
    <form ref={formRef} action={formAction} noValidate className="flex max-w-md flex-col gap-4">
      <FormField
        {...fieldProps("effectiveFrom", versionT("effectiveFrom"))}
        hint={versionT("effectiveFromHint")}
      >
        <DatePicker {...controlProps("effectiveFrom")} required />
      </FormField>

      {isOneOff ? (
        <input type="hidden" name="repetition" value={ONCE} />
      ) : (
        <FormField {...fieldProps("repetition", t("repetition"))}>
          {/* Not a controlled `value`: the form reset after an action puts a controlled select back
              on its first option, and only a `defaultValue` (remounted by the key) survives it. */}
          <Select
            key={`repetition-${resultCount}`}
            id={ID_OF.repetition}
            name="repetition"
            defaultValue={repetition}
            onChange={(event) => setRepetition(repetitionChoiceOf(event.target.value))}
          >
            {REPETITION_CHOICES.filter((choice) => choice !== ONCE).map((choice) => (
              <option key={choice} value={choice}>
                {t(`repetitions.${choice}`)}
              </option>
            ))}
          </Select>
        </FormField>
      )}

      {!isOneOff && (numberUnit !== undefined || !isHydrated) ? (
        <FormField
          {...fieldProps(
            "repetitionValue",
            numberUnit === undefined ? t("repetitionValue") : t(`repetitionValues.${numberUnit}`),
          )}
        >
          <DraftTextInput
            id={ID_OF.repetitionValue}
            name="repetitionValue"
            inputMode="numeric"
            isDraft={isWholeNumberDraft}
            refusalMessage="wholeNumberCharacterRefused"
            defaultValue={values.repetitionValue}
            className={CONTROL_CLASS}
          />
        </FormField>
      ) : null}

      <FormField {...fieldProps("businessDayRule", t("businessDay"))} hint={t("businessDayHint")}>
        <Select key={`business-day-${resultCount}`} {...controlProps("businessDayRule")}>
          {BUSINESS_DAY_RULES.map((rule) => (
            <option key={rule} value={rule}>
              {t(`businessDayRules.${rule}`)}
            </option>
          ))}
        </Select>
      </FormField>

      <AmountModeFields
        key={`amount-mode-${resultCount}`}
        modeId={ID_OF.amountMode}
        windowId={ID_OF.averageWindow}
        mode={amountMode}
        averageWindow={averageWindow}
        onModeChange={setAmountMode}
        onAverageWindowChange={setAverageWindow}
        showWindow={isRolling || !isHydrated}
        modeError={state?.field === "amountMode" ? state.message : undefined}
        windowError={state?.field === "averageWindow" ? state.message : undefined}
      />

      <FormField
        {...fieldProps("amount", isRolling ? t("startingEstimate") : t("amount"))}
        hint={isRolling ? `${t("amountHint")} ${t("startingEstimateHint")}` : t("amountHint")}
      >
        <AmountInput {...controlProps("amount")} className={CONTROL_CLASS} required />
      </FormField>

      {/* A refusal that no control shows, such as a failed save, is told above the button. */}
      {state !== null && !hasOwnControl ? (
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
        {versionT("submit")}
      </Button>
    </form>
  );
}
