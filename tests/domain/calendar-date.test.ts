import { describe, expect, it } from "vitest";

import { addDays, clampedDate, daysInMonth, weekdayOf } from "../../src/domain/calendar-date";

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

describe("weekdayOf", () => {
  it("numbers Sunday 0 and Saturday 6", () => {
    expect(weekdayOf("2026-01-31")).toBe(SATURDAY);
    expect(weekdayOf("2026-02-01")).toBe(SUNDAY);
  });
});
