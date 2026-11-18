"use client";

import { useTranslations } from "next-intl";

import { Button } from "../../components/button";
import { WIDE_HIDDEN_CLASS } from "./add-transaction-layout";
import { canGoBack, type Step } from "./add-transaction-steps";

interface StepNavProps {
  step: Step;
  onBack?: () => void;
  /** The last step has no Next: its save button does the job. */
  onNext?: () => void;
}

/** Back (secondary) and Next (primary) of the steps; the first step has no Back. */
export function StepNav({ step, onBack, onNext }: StepNavProps) {
  const add = useTranslations("transactions.add");

  return (
    <div className={`flex gap-3 ${WIDE_HIDDEN_CLASS}`}>
      {onBack !== undefined && canGoBack(step) ? (
        <Button type="button" variant="secondary" className="min-h-13 flex-1" onClick={onBack}>
          {add("back")}
        </Button>
      ) : null}
      {onNext === undefined ? null : (
        <Button type="button" className="min-h-13 flex-1" onClick={onNext}>
          {add("next")}
        </Button>
      )}
    </div>
  );
}
