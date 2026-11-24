// Contract of src/app/calendar/month-grid-keyboard.ts (issue #173).
//
//   reduceGridKey(
//     state: { focused: string; opened: string | null },  // YYYY-MM-DD each
//     key: string,                                        // KeyboardEvent.key
//     modifiers: DateKeyModifiers,                        // from components/date-picker-keyboard
//     weekStart: number,                                  // 0 (Sunday) to 6
//     month: string,                                      // displayed month, YYYY-MM
//   ): { focused: string; opened: string | null; handled: boolean }
//
// It wraps `resolveDateKey`, so the arrows, Home, End, Page Up and Page Down move `focused`, but the
// result is clamped to the displayed month (the grid shows one month). Enter and Space set
// `opened` to the focused day. Escape, unknown keys and keys with Alt, Ctrl or Meta are not
// handled: the state comes back unchanged and `handled` is false. A key that moves but is clamped
// to the same day is still handled (the browser default, scrolling, must be prevented).
import { describe, expect, it } from "vitest";

import { reduceGridKey } from "../../../src/app/calendar/month-grid-keyboard";

const MONTH = "2026-11";
const SUNDAY = 0;
const MONDAY = 1;
const NO_MODIFIERS = { shift: false, alt: false, ctrl: false, meta: false };

const press = (
  focused: string,
  key: string,
  { opened = null, weekStart = SUNDAY, modifiers = NO_MODIFIERS } = {} as {
    opened?: string | null;
    weekStart?: number;
    modifiers?: typeof NO_MODIFIERS;
  },
) => reduceGridKey({ focused, opened }, key, modifiers, weekStart, MONTH);

describe("month grid keyboard", () => {
  it("moves the focus without opening a day", () => {
    expect(press("2026-11-10", "ArrowRight")).toEqual({ focused: "2026-11-11", opened: null, handled: true });
    expect(press("2026-11-10", "ArrowDown")).toEqual({ focused: "2026-11-17", opened: null, handled: true });
  });

  it("keeps the day that is already open while the focus moves", () => {
    expect(press("2026-11-10", "ArrowLeft", { opened: "2026-11-02" })).toEqual({
      focused: "2026-11-09",
      opened: "2026-11-02",
      handled: true,
    });
  });

  it("opens the focused day with Enter", () => {
    expect(press("2026-11-12", "Enter")).toEqual({ focused: "2026-11-12", opened: "2026-11-12", handled: true });
  });

  it("opens the focused day with Space", () => {
    expect(press("2026-11-12", " ")).toEqual({ focused: "2026-11-12", opened: "2026-11-12", handled: true });
  });

  it("replaces the open day when another one is opened", () => {
    expect(press("2026-11-20", "Enter", { opened: "2026-11-12" }).opened).toBe("2026-11-20");
  });

  it("stays on the first day of the month when going before it", () => {
    expect(press("2026-11-01", "ArrowLeft")).toEqual({ focused: "2026-11-01", opened: null, handled: true });
    expect(press("2026-11-03", "ArrowUp").focused).toBe("2026-11-01");
  });

  it("stays on the last day of the month when going past it", () => {
    expect(press("2026-11-30", "ArrowRight")).toEqual({ focused: "2026-11-30", opened: null, handled: true });
    expect(press("2026-11-28", "ArrowDown").focused).toBe("2026-11-30");
    expect(press("2026-11-30", "PageDown").focused).toBe("2026-11-30");
  });

  it("clamps Home and End to the month when the week sticks out of it", () => {
    // 1 Nov 2026 is a Sunday, so a Monday-first week starts on 26 Oct and ends on 1 Nov.
    expect(press("2026-11-01", "Home", { weekStart: MONDAY }).focused).toBe("2026-11-01");
    // 30 Nov 2026 is a Monday: its week ends on 6 Dec.
    expect(press("2026-11-30", "End", { weekStart: MONDAY }).focused).toBe("2026-11-30");
  });

  it("does not handle Escape, since nothing opens", () => {
    expect(press("2026-11-10", "Escape", { opened: "2026-11-02" })).toEqual({
      focused: "2026-11-10",
      opened: "2026-11-02",
      handled: false,
    });
  });

  it("leaves the state unchanged on a key it does not know", () => {
    expect(press("2026-11-10", "a")).toEqual({ focused: "2026-11-10", opened: null, handled: false });
  });

  it("does not handle a key combined with Ctrl", () => {
    const modifiers = { ...NO_MODIFIERS, ctrl: true };

    expect(press("2026-11-10", "ArrowRight", { modifiers })).toEqual({
      focused: "2026-11-10",
      opened: null,
      handled: false,
    });
  });
});
