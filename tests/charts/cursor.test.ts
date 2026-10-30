import { describe, expect, it } from "vitest";

import { moveCursor } from "../../src/charts/cursor";

const LAST = 5;

describe("moveCursor", () => {
  it("starts on the most recent category, whichever arrow is pressed first", () => {
    expect(moveCursor("ArrowLeft", null, LAST)).toBe(LAST);
    expect(moveCursor("ArrowRight", null, LAST)).toBe(LAST);
  });

  it("steps one category at a time", () => {
    expect(moveCursor("ArrowLeft", 3, LAST)).toBe(2);
    expect(moveCursor("ArrowRight", 3, LAST)).toBe(4);
  });

  it("stops at both ends instead of wrapping", () => {
    expect(moveCursor("ArrowLeft", 0, LAST)).toBe(0);
    expect(moveCursor("ArrowRight", LAST, LAST)).toBe(LAST);
  });

  it("jumps to the first and the last category with Home and End", () => {
    expect(moveCursor("Home", 3, LAST)).toBe(0);
    expect(moveCursor("End", 3, LAST)).toBe(LAST);
  });

  it("ignores the other keys", () => {
    expect(moveCursor("a", 3, LAST)).toBeNull();
    expect(moveCursor("Tab", null, LAST)).toBeNull();
  });
});
