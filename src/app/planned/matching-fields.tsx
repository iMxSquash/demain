"use client";

import { useTranslations } from "next-intl";

import { Disclosure } from "../../components/disclosure";
import { AmountInput } from "../amount-input";
import { CONTROL_CLASS, FormField } from "../form-field";
import { WholeNumberInput } from "../whole-number-input";

interface MatchingFieldsProps {
  windowDays: string;
  tolerancePercent: string;
  windowError: string | undefined;
  toleranceError: string | undefined;
}

/**
 * The matching window and tolerance, closed by default since the defaults suit most items. A
 * refusal opens it: focus does not land inside a closed `details`.
 */
export function MatchingFields({
  windowDays,
  tolerancePercent,
  windowError,
  toleranceError,
}: MatchingFieldsProps) {
  const t = useTranslations("planned.form");
  const hasError = windowError !== undefined || toleranceError !== undefined;

  return (
    <Disclosure summary={t("matching")} open={hasError || undefined}>
      <div className="grid gap-4 pt-2 @min-[640px]:grid-cols-2">
        <FormField
          id="matchWindowDays"
          label={t("windowDays")}
          hint={t("windowDaysHint")}
          error={windowError}
        >
          <WholeNumberInput
            id="matchWindowDays"
            name="matchWindowDays"
            defaultValue={windowDays}
            className={CONTROL_CLASS}
          />
        </FormField>
        <FormField
          id="matchTolerancePercent"
          label={t("tolerance")}
          hint={t("toleranceHint")}
          error={toleranceError}
        >
          <AmountInput
            id="matchTolerancePercent"
            name="matchTolerancePercent"
            defaultValue={tolerancePercent}
            className={CONTROL_CLASS}
          />
        </FormField>
      </div>
    </Disclosure>
  );
}
