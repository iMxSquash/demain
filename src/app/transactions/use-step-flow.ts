"use client";

import { useEffect, useRef, useState } from "react";

import type { Step } from "./add-transaction-steps";

/**
 * The current step of the phone flow, and the focus that follows it: the heading of a new step
 * takes the focus at once, before the slide is done (DESIGN section 6, Motion). The first step
 * is not focused on load.
 */
export function useStepFlow() {
  const [step, setStep] = useState<Step>(1);
  const headings = useRef(new Map<Step, HTMLElement>());
  const shouldFocusHeading = useRef(false);

  useEffect(() => {
    if (!shouldFocusHeading.current) return;
    shouldFocusHeading.current = false;
    headings.current.get(step)?.focus();
  }, [step]);

  /** Goes to a step and gives the focus to its heading. */
  function moveTo(next: Step) {
    shouldFocusHeading.current = next !== step;
    setStep(next);
  }

  /** Shows a step without moving the focus: the caller gives it to a field in error. */
  const showStep = setStep;

  function headingRef(forStep: Step) {
    return (element: HTMLElement | null) => {
      if (element === null) headings.current.delete(forStep);
      else headings.current.set(forStep, element);
    };
  }

  return { step, moveTo, showStep, headingRef };
}
