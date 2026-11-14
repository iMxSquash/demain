// Mirrors the motion tokens of tokens.css (DESIGN.md, Motion). Motion takes seconds, the CSS tokens
// are in milliseconds: tests/design/motion.test.ts keeps the two in step.
export const MOTION = {
  duration: { state: 0.12, exit: 0.14, enter: 0.2, step: 0.26, draw: 0.6 },
  ease: {
    enter: [0.2, 0, 0, 1],
    exit: [0.4, 0, 1, 1],
    move: [0.4, 0, 0.2, 1],
  },
  offset: { rise: 8, step: 24 },
} as const;

export type MotionValues = {
  duration: { [Name in keyof typeof MOTION.duration]: number };
  ease: { [Name in keyof typeof MOTION.ease]: readonly number[] };
  offset: { [Name in keyof typeof MOTION.offset]: number };
};

const REDUCED_MOTION: MotionValues = {
  duration: { state: 0, exit: 0, enter: 0, step: 0, draw: 0 },
  // Easings stay: a zero duration ignores them, and a component needs a curve to read.
  ease: MOTION.ease,
  offset: { rise: 0, step: 0 },
};

// Zeroing the values here is what removes the fades too: Motion's own reducedMotion="user" setting
// only drops transforms and keeps opacity animations.
export function resolveMotion(prefersReducedMotion: boolean): MotionValues {
  return prefersReducedMotion ? REDUCED_MOTION : MOTION;
}
