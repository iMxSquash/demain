import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { MOTION, resolveMotion } from "../../src/app/motion";

const TOKENS_CSS = readFileSync("src/app/tokens.css", "utf8");
const MS_PER_SECOND = 1000;

function readToken(name: string): string {
  const match = new RegExp(`--${name}:\\s*([^;]+);`).exec(TOKENS_CSS);
  const value = match?.[1];
  if (value === undefined) throw new Error(`Token --${name} not found in tokens.css`);
  return value.trim();
}

function readMilliseconds(name: string): number {
  return Number.parseFloat(readToken(name));
}

function readPixels(name: string): number {
  return Number.parseFloat(readToken(name));
}

function readBezier(name: string): number[] {
  const match = /cubic-bezier\(([^)]+)\)/.exec(readToken(name));
  const curve = match?.[1];
  if (curve === undefined) throw new Error(`Token --${name} is not a cubic-bezier`);
  return curve.split(",").map((value) => Number.parseFloat(value));
}

describe("motion values", () => {
  it("mirror the duration tokens of tokens.css, in seconds", () => {
    expect(MOTION.duration).toEqual({
      state: readMilliseconds("motion-duration-state") / MS_PER_SECOND,
      exit: readMilliseconds("motion-duration-exit") / MS_PER_SECOND,
      enter: readMilliseconds("motion-duration-enter") / MS_PER_SECOND,
      step: readMilliseconds("motion-duration-step") / MS_PER_SECOND,
      draw: readMilliseconds("motion-duration-draw") / MS_PER_SECOND,
    });
  });

  it("mirror the easing tokens of tokens.css", () => {
    expect(MOTION.ease).toEqual({
      enter: readBezier("motion-ease-enter"),
      exit: readBezier("motion-ease-exit"),
      move: readBezier("motion-ease-move"),
    });
  });

  it("mirror the offset tokens of tokens.css, in pixels", () => {
    expect(MOTION.offset).toEqual({
      rise: readPixels("motion-offset"),
      step: readPixels("motion-offset-step"),
    });
  });

  it("keep every duration at or under the draw duration", () => {
    expect(Math.max(...Object.values(MOTION.duration))).toBe(MOTION.duration.draw);
  });
});

describe("resolveMotion", () => {
  it("returns the tokens when the user accepts motion", () => {
    expect(resolveMotion(false)).toEqual(MOTION);
  });

  it("returns 0 for every duration when motion is reduced, fades included", () => {
    const { duration } = resolveMotion(true);

    expect(Object.values(duration)).toEqual([0, 0, 0, 0, 0]);
  });

  it("returns 0 for every offset when motion is reduced", () => {
    const { offset } = resolveMotion(true);

    expect(Object.values(offset)).toEqual([0, 0]);
  });

  it("keeps the easings when motion is reduced, since a zero duration ignores them", () => {
    expect(resolveMotion(true).ease).toEqual(MOTION.ease);
  });
});
