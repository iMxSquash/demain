"use client";

import { m } from "motion/react";
import { useTranslations } from "next-intl";

import { useMotion } from "../motion-provider";
import { STEPS, STEP_COUNT, type Step } from "./add-transaction-steps";

interface StepProgressProps {
  step: Step;
}

/**
 * The three-segment progress bar (DESIGN section 10) and the polite "Step N of 3". The bar is
 * hidden from assistive technology: the text carries the same information. It is rendered after
 * hydration only (a Motion component rendered by the server would put a style in the HTML).
 */
export function StepProgress({ step }: StepProgressProps) {
  const add = useTranslations("transactions.add");
  const motion = useMotion();

  return (
    <div className="@min-[760px]:hidden">
      <div aria-hidden="true" className="flex gap-1">
        {STEPS.map((segment) => (
          <span key={segment} className="h-1 flex-1 overflow-hidden rounded-pill bg-control">
            {/* `initial={false}`: only a step reached after the page is shown is animated. */}
            <m.span
              className="block h-full origin-left bg-primary"
              initial={false}
              animate={{ scaleX: segment <= step ? 1 : 0 }}
              transition={{ duration: motion.duration.step, ease: motion.ease.move }}
            />
          </span>
        ))}
      </div>
      <p aria-live="polite" className="mt-2 text-caption text-text-muted">
        {add("stepOf", { current: step, total: STEP_COUNT })}
      </p>
    </div>
  );
}
