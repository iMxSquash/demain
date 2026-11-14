"use client";

import { LazyMotion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

import { resolveMotion, type MotionValues } from "./motion";

// strict: a component must use `m` (not `motion`), so the features are never bundled twice.
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion
      features={() => import("./motion-features").then((module) => module.default)}
      strict
    >
      {children}
    </LazyMotion>
  );
}

// Motion values for the user's current preference. Always read them from here, never from MOTION.
export function useMotion(): MotionValues {
  return resolveMotion(useReducedMotion() === true);
}
