"use client";

import { m } from "motion/react";
import type { ReactNode } from "react";

import { useMotion } from "../motion-provider";
import { stepDirection, type Step } from "./add-transaction-steps";

interface StepPanelProps {
  /** The step this panel is, and the step the flow is on. */
  step: Step;
  current: Step;
  /** Before hydration every panel shows, one after the other: the form is the no-script form. */
  isHydrated: boolean;
  headingId: string;
  headingRef: (element: HTMLElement | null) => void;
  heading: ReactNode;
  /** The gap between the heading and the content, and what the wide layout adds (a divider). */
  className: string;
  children: ReactNode;
}

// From the wide breakpoint on every panel is in view and nothing moves: the rules beat the
// opacity and the transform that Motion writes on a panel waiting for its turn.
const WIDE_STILL_CLASS =
  "@min-[760px]:flex @min-[760px]:opacity-100! @min-[760px]:[transform:none]!";

/**
 * One step of the form. The panels stay mounted whatever the step, so every field posts; a
 * panel that is not the current one is hidden on a narrow screen. The one that becomes current
 * slides in from the side it comes from and fades in; the old one leaves at once.
 */
export function StepPanel({
  step,
  current,
  isHydrated,
  headingId,
  headingRef,
  heading,
  className,
  children,
}: StepPanelProps) {
  const motion = useMotion();
  const direction = stepDirection(current, step);
  const isWaiting = isHydrated && direction !== "none";
  const offset = direction === "forward" ? motion.offset.step : -motion.offset.step;

  return (
    <m.section
      aria-labelledby={headingId}
      // No `animate` before hydration: Motion would write the final state into a style attribute
      // of the HTML, which the CSP refuses. `initial={false}` keeps the first state unanimated.
      initial={false}
      animate={
        !isHydrated ? undefined : isWaiting ? { opacity: 0, x: offset } : { opacity: 1, x: 0 }
      }
      transition={
        isWaiting ? { duration: 0 } : { duration: motion.duration.step, ease: motion.ease.move }
      }
      className={`flex-col ${className} ${isWaiting ? "hidden" : "flex"} ${WIDE_STILL_CLASS}`}
    >
      <h3 id={headingId} ref={headingRef} tabIndex={-1} className="text-title font-medium">
        {heading}
      </h3>
      {children}
    </m.section>
  );
}
