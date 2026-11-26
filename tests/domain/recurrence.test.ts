import { describe, expect, it } from "vitest";

import {
  adjustToBusinessDay,
  isValidRepetition,
  nominalDates,
  type Repetition,
} from "../../src/domain/recurrence";

const WIDE_RANGE = { from: "2026-01-01", to: "2030-12-31" };

describe("nominalDates", () => {
  describe("one-off event", () => {
    it("returns only the anchor for a one-off event inside the range", () => {
      expect(nominalDates(null, "2026-03-15", { from: "2026-03-01", to: "2026-03-31" })).toEqual([
        "2026-03-15",
      ]);
    });

    it("returns nothing for a one-off event outside the range", () => {
      expect(nominalDates(null, "2026-04-15", { from: "2026-03-01", to: "2026-03-31" })).toEqual(
        [],
      );
    });
  });

  describe("monthly on day N", () => {
    const onThe31st: Repetition = { kind: "monthly_on_day", day: 31 };

    it("falls back to the last day of shorter months and returns to the 31st", () => {
      expect(
        nominalDates(onThe31st, "2026-01-31", { from: "2026-02-01", to: "2026-05-31" }),
      ).toEqual(["2026-02-28", "2026-03-31", "2026-04-30", "2026-05-31"]);
    });

    it("includes the anchor when it is on the rule", () => {
      expect(
        nominalDates(onThe31st, "2026-01-31", { from: "2026-01-01", to: "2026-02-28" }),
      ).toEqual(["2026-01-31", "2026-02-28"]);
    });

    it("gives 29 February in a leap year and 28 February otherwise", () => {
      const onThe29th: Repetition = { kind: "monthly_on_day", day: 29 };
      expect(
        nominalDates(onThe29th, "2027-02-01", { from: "2027-02-01", to: "2027-02-28" }),
      ).toEqual(["2027-02-28"]);
      expect(
        nominalDates(onThe29th, "2028-02-01", { from: "2028-02-01", to: "2028-02-29" }),
      ).toEqual(["2028-02-29"]);
    });

    it("starts with the first date of the rule on or after a start date that is not on the rule", () => {
      const onThe5th: Repetition = { kind: "monthly_on_day", day: 5 };
      expect(
        nominalDates(onThe5th, "2026-01-20", { from: "2026-01-01", to: "2026-03-31" }),
      ).toEqual(["2026-02-05", "2026-03-05"]);
    });

    it("keeps a start date that falls exactly on the rule", () => {
      const onThe5th: Repetition = { kind: "monthly_on_day", day: 5 };
      expect(
        nominalDates(onThe5th, "2026-01-05", { from: "2026-01-01", to: "2026-02-28" }),
      ).toEqual(["2026-01-05", "2026-02-05"]);
    });
  });

  describe("monthly on last day", () => {
    const onLastDay: Repetition = { kind: "monthly_on_last_day" };

    it("follows leap years", () => {
      expect(
        nominalDates(onLastDay, "2027-01-01", { from: "2027-02-01", to: "2027-02-28" }),
      ).toEqual(["2027-02-28"]);
      expect(
        nominalDates(onLastDay, "2028-01-01", { from: "2028-02-01", to: "2028-02-29" }),
      ).toEqual(["2028-02-29"]);
    });

    it("starts with the last day of the start month when the start is mid-month", () => {
      expect(
        nominalDates(onLastDay, "2026-01-15", { from: "2026-01-01", to: "2026-02-28" }),
      ).toEqual(["2026-01-31", "2026-02-28"]);
    });

    it("keeps a start date that is already the last day of its month", () => {
      expect(
        nominalDates(onLastDay, "2026-01-31", { from: "2026-01-01", to: "2026-02-28" }),
      ).toEqual(["2026-01-31", "2026-02-28"]);
    });
  });

  describe("every N months", () => {
    it("clamps per month and comes back, from 31 August every 3 months", () => {
      expect(
        nominalDates({ kind: "every_n_months", months: 3 }, "2026-08-31", WIDE_RANGE).slice(0, 4),
      ).toEqual(["2026-08-31", "2026-11-30", "2027-02-28", "2027-05-31"]);
    });

    it("keeps its phase when the range starts after the anchor", () => {
      expect(
        nominalDates({ kind: "every_n_months", months: 2 }, "2026-01-10", {
          from: "2026-02-01",
          to: "2026-07-31",
        }),
      ).toEqual(["2026-03-10", "2026-05-10", "2026-07-10"]);
    });
  });

  describe("quarterly", () => {
    it("is every 3 months from the anchor", () => {
      const quarterly = nominalDates({ kind: "quarterly" }, "2026-02-15", WIDE_RANGE).slice(0, 4);
      expect(quarterly).toEqual(["2026-02-15", "2026-05-15", "2026-08-15", "2026-11-15"]);
    });

    it("gives the same dates as every 3 months", () => {
      expect(nominalDates({ kind: "every_n_months", months: 3 }, "2026-02-15", WIDE_RANGE)).toEqual(
        nominalDates({ kind: "quarterly" }, "2026-02-15", WIDE_RANGE),
      );
    });

    it("clamps and comes back like every 3 months", () => {
      expect(nominalDates({ kind: "quarterly" }, "2026-08-31", WIDE_RANGE).slice(0, 4)).toEqual([
        "2026-08-31",
        "2026-11-30",
        "2027-02-28",
        "2027-05-31",
      ]);
    });
  });

  describe("yearly", () => {
    it("repeats the day and month of the anchor every year", () => {
      expect(
        nominalDates({ kind: "yearly" }, "2026-06-12", { from: "2026-01-01", to: "2028-12-31" }),
      ).toEqual(["2026-06-12", "2027-06-12", "2028-06-12"]);
    });

    it("uses 28 February in years without 29 February and comes back in leap years", () => {
      expect(
        nominalDates({ kind: "yearly" }, "2028-02-29", { from: "2028-01-01", to: "2032-12-31" }),
      ).toEqual(["2028-02-29", "2029-02-28", "2030-02-28", "2031-02-28", "2032-02-29"]);
    });
  });

  describe("every N weeks", () => {
    it("keeps its phase when the range starts after the anchor", () => {
      const dates = nominalDates({ kind: "every_n_weeks", weeks: 2 }, "2026-01-01", {
        from: "2026-01-10",
        to: "2026-02-28",
      });
      expect(dates[0]).toBe("2026-01-15");
    });

    it("crosses a year end", () => {
      expect(
        nominalDates({ kind: "every_n_weeks", weeks: 2 }, "2026-12-24", {
          from: "2026-12-24",
          to: "2027-01-31",
        }),
      ).toEqual(["2026-12-24", "2027-01-07", "2027-01-21"]);
    });
  });

  describe("range", () => {
    const weekly: Repetition = { kind: "every_n_weeks", weeks: 1 };

    it("includes the end of the range", () => {
      expect(nominalDates(weekly, "2026-01-01", { from: "2026-01-01", to: "2026-01-15" })).toEqual([
        "2026-01-01",
        "2026-01-08",
        "2026-01-15",
      ]);
    });

    it("returns the day of a one-day range that is a nominal date", () => {
      expect(nominalDates(weekly, "2026-01-01", { from: "2026-01-08", to: "2026-01-08" })).toEqual([
        "2026-01-08",
      ]);
      expect(nominalDates(weekly, "2026-01-01", { from: "2026-01-09", to: "2026-01-09" })).toEqual(
        [],
      );
    });

    it("returns nothing for an empty range", () => {
      expect(nominalDates(weekly, "2026-01-01", { from: "2026-02-01", to: "2026-01-01" })).toEqual(
        [],
      );
    });

    it("returns nothing for a range entirely before the anchor", () => {
      expect(nominalDates(weekly, "2026-06-01", { from: "2026-01-01", to: "2026-05-31" })).toEqual(
        [],
      );
    });
  });

  describe("end of the supported years", () => {
    const lastDays = { from: "9999-12-01", to: "9999-12-31" };

    it("stops a weekly rule at the last supported day", () => {
      expect(nominalDates({ kind: "every_n_weeks", weeks: 1 }, "9999-12-20", lastDays)).toEqual([
        "9999-12-20",
        "9999-12-27",
      ]);
    });

    it("stops a monthly rule in the last supported year", () => {
      expect(nominalDates({ kind: "monthly_on_last_day" }, "9999-11-01", lastDays)).toEqual([
        "9999-12-31",
      ]);
    });
  });

  describe("invalid input", () => {
    it("refuses an invalid repetition instead of looping", () => {
      expect(() =>
        nominalDates({ kind: "every_n_weeks", weeks: 0 }, "2026-01-01", WIDE_RANGE),
      ).toThrow(RangeError);
    });

    it("refuses a date that does not exist", () => {
      expect(() => nominalDates({ kind: "yearly" }, "2026-02-30", WIDE_RANGE)).toThrow(RangeError);
      expect(() =>
        nominalDates({ kind: "yearly" }, "2026-01-01", { from: "2026-01-01", to: "soon" }),
      ).toThrow(RangeError);
    });
  });
});

describe("adjustToBusinessDay", () => {
  it("moves a Saturday to the next Monday", () => {
    expect(adjustToBusinessDay("2026-01-31", "next")).toBe("2026-02-02");
  });

  it("moves a Sunday to the previous Friday", () => {
    expect(adjustToBusinessDay("2026-02-01", "previous")).toBe("2026-01-30");
  });

  it("moves a Saturday to the previous Friday across a year end", () => {
    expect(adjustToBusinessDay("2028-01-01", "previous")).toBe("2027-12-31");
  });

  it("moves a Saturday to the next Monday across a year end", () => {
    expect(adjustToBusinessDay("2022-12-31", "next")).toBe("2023-01-02");
  });

  it("moves a Sunday to the next Monday", () => {
    expect(adjustToBusinessDay("2026-02-01", "next")).toBe("2026-02-02");
  });

  it("leaves a weekday unchanged with both rules", () => {
    expect(adjustToBusinessDay("2026-01-28", "previous")).toBe("2026-01-28");
    expect(adjustToBusinessDay("2026-01-28", "next")).toBe("2026-01-28");
  });

  it("never moves a date with the rule none", () => {
    expect(adjustToBusinessDay("2026-01-31", "none")).toBe("2026-01-31");
    expect(adjustToBusinessDay("2026-02-01", "none")).toBe("2026-02-01");
  });
});

describe("isValidRepetition", () => {
  it("refuses day 0, day 32 and a non-integer day", () => {
    expect(isValidRepetition({ kind: "monthly_on_day", day: 0 })).toBe(false);
    expect(isValidRepetition({ kind: "monthly_on_day", day: 32 })).toBe(false);
    expect(isValidRepetition({ kind: "monthly_on_day", day: 1.5 })).toBe(false);
  });

  it("accepts day 1 and day 31", () => {
    expect(isValidRepetition({ kind: "monthly_on_day", day: 1 })).toBe(true);
    expect(isValidRepetition({ kind: "monthly_on_day", day: 31 })).toBe(true);
  });

  it("refuses 0 months, 0 weeks and non-integer counts", () => {
    expect(isValidRepetition({ kind: "every_n_months", months: 0 })).toBe(false);
    expect(isValidRepetition({ kind: "every_n_weeks", weeks: 0 })).toBe(false);
    expect(isValidRepetition({ kind: "every_n_months", months: 1.5 })).toBe(false);
  });

  it("accepts the kinds without a parameter and positive counts", () => {
    expect(isValidRepetition({ kind: "monthly_on_last_day" })).toBe(true);
    expect(isValidRepetition({ kind: "quarterly" })).toBe(true);
    expect(isValidRepetition({ kind: "yearly" })).toBe(true);
    expect(isValidRepetition({ kind: "every_n_months", months: 1 })).toBe(true);
    expect(isValidRepetition({ kind: "every_n_weeks", weeks: 52 })).toBe(true);
  });
});
