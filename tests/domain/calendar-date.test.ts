import { describe, expect, it } from "vitest";

import { addDays, addMonths, clampedDate, daysInMonth, weekdayOf } from "../../src/domain/calendar-date";

const SATURDAY = 6;
const SUNDAY = 0;

describe("daysInMonth", () => {
  it("returns 28 for February of a common year", () => {
    expect(daysInMonth(2026, 2)).toBe(28);
  });

  it("returns 29 for February of a leap year", () => {
    expect(daysInMonth(2028, 2)).toBe(29);
  });

  it("follows the century rule", () => {
    expect(daysInMonth(2100, 2)).toBe(28);
    expect(daysInMonth(2000, 2)).toBe(29);
  });

  it("returns 31 for January and 30 for April", () => {
    expect(daysInMonth(2026, 1)).toBe(31);
    expect(daysInMonth(2026, 4)).toBe(30);
  });
});

describe("clampedDate", () => {
  it("falls back to the last day of a shorter month", () => {
    expect(clampedDate(2026, 2, 31)).toBe("2026-02-28");
    expect(clampedDate(2028, 2, 30)).toBe("2028-02-29");
  });

  it("keeps the day when the month is long enough", () => {
    expect(clampedDate(2026, 3, 31)).toBe("2026-03-31");
    expect(clampedDate(2026, 11, 5)).toBe("2026-11-05");
  });
});

describe("addDays", () => {
  it("crosses a month end and a year end", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("goes backwards", () => {
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("stays where it is past the last supported year", () => {
    expect(addDays("9999-12-31", 1)).toBe("9999-12-31");
  });

  it("stays where it is before the first supported year", () => {
    expect(addDays("0001-01-01", -1)).toBe("0001-01-01");
  });
});

describe("addMonths", () => {
  it("adds months inside a year", () => {
    expect(addMonths("2026-03-15", 2)).toBe("2026-05-15");
  });

  it("crosses a year end going forward", () => {
    expect(addMonths("2026-11-10", 3)).toBe("2027-02-10");
  });

  it("crosses a year start going backward", () => {
    expect(addMonths("2026-02-10", -3)).toBe("2025-11-10");
    expect(addMonths("2026-01-10", -1)).toBe("2025-12-10");
  });

  it("moves by whole years", () => {
    expect(addMonths("2026-06-30", -12)).toBe("2025-06-30");
    expect(addMonths("2026-06-30", 24)).toBe("2028-06-30");
  });

  it("clamps the day to the length of the target month", () => {
    expect(addMonths("2026-03-31", -1)).toBe("2026-02-28");
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2028-03-31", -1)).toBe("2028-02-29");
    expect(addMonths("2026-05-31", 1)).toBe("2026-06-30");
  });

  it("returns the same date for zero months", () => {
    expect(addMonths("2026-03-31", 0)).toBe("2026-03-31");
  });

  it("stays where it is past the last supported year", () => {
    expect(addMonths("9999-12-15", 1)).toBe("9999-12-15");
    expect(addMonths("9999-06-30", 24)).toBe("9999-06-30");
  });

  it("stays where it is before the first supported year", () => {
    expect(addMonths("0001-01-15", -1)).toBe("0001-01-15");
    expect(addMonths("0002-06-30", -24)).toBe("0002-06-30");
  });

  it("still reaches the first and last supported months", () => {
    expect(addMonths("0001-02-15", -1)).toBe("0001-01-15");
    expect(addMonths("9999-11-30", 1)).toBe("9999-12-30");
  });
});

describe("weekdayOf", () => {
  it("numbers Sunday 0 and Saturday 6", () => {
    expect(weekdayOf("2026-01-31")).toBe(SATURDAY);
    expect(weekdayOf("2026-02-01")).toBe(SUNDAY);
  });
});
