"use client";

import { useTranslations } from "next-intl";

import { Disclosure } from "../../components/disclosure";
import { isWholeNumberDraft } from "../../domain/amount-syntax";
import { isTolerancePercentDraft } from "../../domain/planned-item";
import { DraftTextInput } from "../draft-text-input";
import { CONTROL_CLASS, FormField } from "../form-field";

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
          <DraftTextInput
            id="matchWindowDays"
            name="matchWindowDays"
            inputMode="numeric"
            isDraft={isWholeNumberDraft}
            refusalMessage="wholeNumberCharacterRefused"
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
          <DraftTextInput
            id="matchTolerancePercent"
            name="matchTolerancePercent"
            inputMode="decimal"
            isDraft={isTolerancePercentDraft}
            refusalMessage="percentCharacterRefused"
            defaultValue={tolerancePercent}
            className={CONTROL_CLASS}
          />
        </FormField>
      </div>
    </Disclosure>
  );
}
