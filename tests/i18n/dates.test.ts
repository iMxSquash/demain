import { describe, expect, it } from "vitest";

import {
  formatCalendarDate,
  formatMonth,
  formatShortMonth,
  todayIn,
} from "../../src/i18n/dates";

describe("formatCalendarDate", () => {
  it("writes the same day in every locale", () => {
    expect(formatCalendarDate("2026-03-01", "fr")).toBe("1 mars 2026");
    expect(formatCalendarDate("2026-03-01", "en")).toBe("Mar 1, 2026");
  });
});

describe("formatMonth", () => {
  it("writes the month name and the year", () => {
    expect(formatMonth("2026-03", "fr")).toBe("mars 2026");
    expect(formatMonth("2026-03", "en")).toBe("March 2026");
  });
});

describe("formatShortMonth", () => {
  it("abbreviates the month and the year for an axis label", () => {
    expect(formatShortMonth("2026-01", "fr")).toBe("janv. 26");
    expect(formatShortMonth("2026-01", "en")).toBe("Jan 26");
  });
});

describe("todayIn", () => {
  const JUST_AFTER_MIDNIGHT_IN_PARIS = new Date("2026-03-14T23:30:00Z");

  it("reads the calendar date in the given time zone", () => {
    expect(todayIn("Europe/Paris", JUST_AFTER_MIDNIGHT_IN_PARIS)).toBe("2026-03-15");
    expect(todayIn("UTC", JUST_AFTER_MIDNIGHT_IN_PARIS)).toBe("2026-03-14");
  });
});
