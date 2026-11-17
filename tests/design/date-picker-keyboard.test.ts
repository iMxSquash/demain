import { describe, expect, it } from "vitest";

import {
  addDays,
  addMonths,
  addYears,
  buildMonthGrid,
  resolveDateKey,
  weekStartOf,
  type DateKeyAction,
  type DateKeyModifiers,
} from "../../src/components/date-picker-keyboard";

const MONDAY = 1;
const SUNDAY = 0;
const NO_MODIFIERS: DateKeyModifiers = { shift: false, alt: false, ctrl: false, meta: false };

function press(
  key: string,
  focused: string,
  { weekStart = MONDAY, ...modifiers }: Partial<DateKeyModifiers> & { weekStart?: number } = {},
): DateKeyAction {
  return resolveDateKey({ focused }, key, { ...NO_MODIFIERS, ...modifiers }, weekStart);
}

function movedTo(action: DateKeyAction): string {
  if (action.type !== "move") throw new Error(`expected a move, got ${action.type}`);
  return action.date;
}

describe("addDays", () => {
  it("moves across month and year ends", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("counts the 29th of February of a leap year", () => {
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2027-02-28", 1)).toBe("2027-03-01");
  });

  it("does not drift on a daylight saving change", () => {
    expect(addDays("2026-03-28", 2)).toBe("2026-03-30");
    expect(addDays("2026-10-24", 2)).toBe("2026-10-26");
  });
});

describe("addMonths", () => {
  it("keeps the day when the month is long enough", () => {
    expect(addMonths("2026-01-15", 1)).toBe("2026-02-15");
    expect(addMonths("2026-01-15", -1)).toBe("2025-12-15");
  });

  it("clamps the day to the last day of a shorter month", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonths("2026-03-31", -1)).toBe("2026-02-28");
  });
});

describe("addYears", () => {
  it("moves a whole year", () => {
    expect(addYears("2026-05-10", 1)).toBe("2027-05-10");
    expect(addYears("2026-05-10", -1)).toBe("2025-05-10");
  });

  it("clamps the 29th of February to the 28th", () => {
    expect(addYears("2028-02-29", 1)).toBe("2029-02-28");
    expect(addYears("2028-02-29", -4)).toBe("2024-02-29");
  });
});

describe("weekStartOf", () => {
  it("starts the French week on Monday", () => {
    expect(weekStartOf("fr")).toBe(MONDAY);
  });

  it("falls back on Monday for a locale that does not parse", () => {
    expect(weekStartOf("not a locale")).toBe(MONDAY);
  });
});

describe("buildMonthGrid", () => {
  it("fills whole weeks around the month, starting on the first day of the week", () => {
    const grid = buildMonthGrid("2026-11", MONDAY);

    expect(grid).toHaveLength(6);
    expect(grid.every((week) => week.length === 7)).toBe(true);
    expect(grid[0]?.[0]).toBe("2026-10-26");
    expect(grid[0]?.[6]).toBe("2026-11-01");
    expect(grid[5]?.[0]).toBe("2026-11-30");
    expect(grid[5]?.[6]).toBe("2026-12-06");
  });

  it("starts on Sunday when the week does", () => {
    const grid = buildMonthGrid("2026-11", SUNDAY);

    expect(grid).toHaveLength(5);
    expect(grid[0]?.[0]).toBe("2026-11-01");
    expect(grid[4]?.[6]).toBe("2026-12-05");
  });

  it("needs six weeks when the month spans six rows", () => {
    expect(buildMonthGrid("2026-08", MONDAY)).toHaveLength(6);
  });

  it("needs four weeks for a February that starts on the first day of the week", () => {
    expect(buildMonthGrid("2027-02", MONDAY)).toHaveLength(4);
  });
});

describe("resolveDateKey, arrows", () => {
  it("moves one day with the horizontal arrows", () => {
    expect(movedTo(press("ArrowRight", "2026-11-17"))).toBe("2026-11-18");
    expect(movedTo(press("ArrowLeft", "2026-11-17"))).toBe("2026-11-16");
  });

  it("moves one week with the vertical arrows", () => {
    expect(movedTo(press("ArrowDown", "2026-11-17"))).toBe("2026-11-24");
    expect(movedTo(press("ArrowUp", "2026-11-17"))).toBe("2026-11-10");
  });

  it("crosses into the neighbouring month", () => {
    expect(movedTo(press("ArrowRight", "2026-11-30"))).toBe("2026-12-01");
    expect(movedTo(press("ArrowUp", "2026-11-03"))).toBe("2026-10-27");
  });
});

describe("resolveDateKey, Home and End", () => {
  it("goes to the first and last day of the week row", () => {
    expect(movedTo(press("Home", "2026-11-18"))).toBe("2026-11-16");
    expect(movedTo(press("End", "2026-11-18"))).toBe("2026-11-22");
  });

  it("stays put on the first day of the week when Home is pressed there", () => {
    expect(movedTo(press("Home", "2026-11-16"))).toBe("2026-11-16");
  });

  it("follows a week that starts on Sunday", () => {
    expect(movedTo(press("Home", "2026-11-18", { weekStart: SUNDAY }))).toBe("2026-11-15");
    expect(movedTo(press("End", "2026-11-18", { weekStart: SUNDAY }))).toBe("2026-11-21");
  });
});

describe("resolveDateKey, Page Up and Page Down", () => {
  it("moves a month", () => {
    expect(movedTo(press("PageDown", "2026-11-17"))).toBe("2026-12-17");
    expect(movedTo(press("PageUp", "2026-11-17"))).toBe("2026-10-17");
  });

  it("clamps the day in a shorter month", () => {
    expect(movedTo(press("PageDown", "2026-01-31"))).toBe("2026-02-28");
  });

  it("moves a year with Shift", () => {
    expect(movedTo(press("PageDown", "2026-11-17", { shift: true }))).toBe("2027-11-17");
    expect(movedTo(press("PageUp", "2026-11-17", { shift: true }))).toBe("2025-11-17");
  });
});

describe("resolveDateKey, Enter, Space and Escape", () => {
  it("chooses the focused day with Enter", () => {
    expect(press("Enter", "2026-11-17")).toEqual({
      type: "commit",
      date: "2026-11-17",
      preventDefault: true,
    });
  });

  it("chooses the focused day with Space", () => {
    expect(press(" ", "2026-11-17")).toMatchObject({ type: "commit", date: "2026-11-17" });
  });

  it("closes with Escape", () => {
    expect(press("Escape", "2026-11-17")).toEqual({ type: "close", preventDefault: true });
  });
});

describe("resolveDateKey, what it leaves alone", () => {
  it("ignores keys it does not know, so Tab keeps its job", () => {
    expect(press("Tab", "2026-11-17")).toEqual({ type: "none" });
    expect(press("a", "2026-11-17")).toEqual({ type: "none" });
  });

  it("ignores a shortcut of the browser or the system", () => {
    expect(press("ArrowLeft", "2026-11-17", { alt: true })).toEqual({ type: "none" });
    expect(press("ArrowLeft", "2026-11-17", { meta: true })).toEqual({ type: "none" });
    expect(press("Home", "2026-11-17", { ctrl: true })).toEqual({ type: "none" });
  });

  it("stops at the edge of the supported years instead of producing an invalid date", () => {
    expect(movedTo(press("ArrowRight", "9999-12-31"))).toBe("9999-12-31");
    expect(movedTo(press("ArrowLeft", "0001-01-01"))).toBe("0001-01-01");
  });
});
