import { describe, expect, it } from "vitest";

import {
  generateOccurrences,
  type Occurrence,
  type OccurrenceOverride,
  type PlannedSchedule,
  type PlannedVersion,
} from "../../src/domain/occurrences";
import type { Repetition } from "../../src/domain/recurrence";

const FAR_TODAY = "2000-01-01";
const SALARY_START = "2026-01-25";

function version(overrides: Partial<PlannedVersion> & Pick<PlannedVersion, "effectiveFrom">): PlannedVersion {
  return {
    repetition: { kind: "monthly_on_day", day: 25 },
    businessDayRule: "none",
    amount: 100,
    amountMode: "fixed",
    averageWindow: 3,
    ...overrides,
  };
}

function schedule(versions: PlannedVersion[], overrides: Partial<PlannedSchedule> = {}): PlannedSchedule {
  const [first] = versions;
  return {
    startDate: first?.effectiveFrom ?? SALARY_START,
    endDate: null,
    cancelled: false,
    versions,
    ...overrides,
  };
}

function generate(
  planned: PlannedSchedule,
  range: { from: string; to: string },
  overrides: OccurrenceOverride[] = [],
  today = FAR_TODAY,
): Occurrence[] {
  return generateOccurrences(planned, overrides, range, today);
}

const dates = (occurrences: Occurrence[]) => occurrences.map((occurrence) => occurrence.date);
const YEAR_2026 = { from: "2026-01-01", to: "2026-12-31" };

describe("generateOccurrences", () => {
  describe("versions", () => {
    it("uses the old salary before the raise and the new one from its effective date", () => {
      const salary = schedule([
        version({ effectiveFrom: SALARY_START, amount: 114388 }),
        version({ effectiveFrom: "2026-06-01", amount: 117147 }),
      ]);

      const occurrences = generate(salary, YEAR_2026);

      const amountOn = (nominalDate: string) => occurrences.find((o) => o.nominalDate === nominalDate)?.amount;
      expect(amountOn("2026-05-25")).toBe(114388);
      expect(amountOn("2026-06-25")).toBe(117147);
      expect(occurrences.find((o) => o.nominalDate === "2026-06-25")?.versionIndex).toBe(1);
    });

    it("moves the rent from the 5th to the 1st from March", () => {
      const rent = schedule([
        version({ effectiveFrom: "2026-01-05", repetition: { kind: "monthly_on_day", day: 5 } }),
        version({ effectiveFrom: "2026-03-01", repetition: { kind: "monthly_on_day", day: 1 } }),
      ]);

      const occurrences = generate(rent, { from: "2026-01-01", to: "2026-04-30" });

      expect(dates(occurrences)).toEqual(["2026-01-05", "2026-02-05", "2026-03-01", "2026-04-01"]);
    });

    it("a version effective on a nominal date applies to that date", () => {
      const planned = schedule([
        version({ effectiveFrom: SALARY_START, amount: 100 }),
        version({ effectiveFrom: "2026-03-25", amount: 200 }),
      ]);

      const occurrences = generate(planned, { from: "2026-02-01", to: "2026-03-31" });

      expect(occurrences.map((o) => [o.nominalDate, o.amount])).toEqual([
        ["2026-02-25", 100],
        ["2026-03-25", 200],
      ]);
    });

    it("handles a version change on 29 February 2028", () => {
      const planned = schedule([
        version({ effectiveFrom: "2028-01-29", repetition: { kind: "monthly_on_day", day: 29 } }),
        version({ effectiveFrom: "2028-02-29", repetition: { kind: "monthly_on_day", day: 1 } }),
      ]);

      const occurrences = generate(planned, { from: "2028-01-01", to: "2028-04-30" });

      expect(dates(occurrences)).toEqual(["2028-01-29", "2028-03-01", "2028-04-01"]);
    });

    it("never changes an occurrence before the effective date of a later version", () => {
      const first = version({ effectiveFrom: SALARY_START, amount: 100 });
      const before = generate(schedule([first]), { from: "2026-01-01", to: "2026-05-31" });

      const after = generate(
        schedule([first, version({ effectiveFrom: "2026-06-01", amount: 999, repetition: { kind: "yearly" } })]),
        { from: "2026-01-01", to: "2026-05-31" },
      );

      expect(after).toEqual(before);
    });

    it("restarts the series from the effective date when the repetition changes", () => {
      const planned = schedule([
        version({ effectiveFrom: "2026-01-01", repetition: { kind: "every_n_weeks", weeks: 2 } }),
        version({ effectiveFrom: "2026-01-10", repetition: { kind: "every_n_weeks", weeks: 3 } }),
      ]);

      const occurrences = generate(planned, { from: "2026-01-01", to: "2026-02-28" });

      expect(dates(occurrences)).toEqual(["2026-01-01", "2026-01-10", "2026-01-31", "2026-02-21"]);
    });

    it("continues the phase of the previous series when only the amount changes", () => {
      const every2Weeks: Repetition = { kind: "every_n_weeks", weeks: 2 };
      const planned = schedule([
        version({ effectiveFrom: "2026-01-01", repetition: every2Weeks, amount: 100 }),
        version({ effectiveFrom: "2026-01-10", repetition: every2Weeks, amount: 200 }),
      ]);

      const occurrences = generate(planned, { from: "2026-01-01", to: "2026-02-15" });

      expect(occurrences.map((o) => [o.nominalDate, o.amount])).toEqual([
        ["2026-01-01", 100],
        ["2026-01-15", 200],
        ["2026-01-29", 200],
        ["2026-02-12", 200],
      ]);
    });

    it("continues the phase when only the amount mode changes", () => {
      const every3Months: Repetition = { kind: "every_n_months", months: 3 };
      const planned = schedule([
        version({ effectiveFrom: "2026-01-15", repetition: every3Months }),
        version({ effectiveFrom: "2026-02-01", repetition: every3Months, amountMode: "rolling_average" }),
      ]);

      expect(dates(generate(planned, YEAR_2026))).toEqual(["2026-01-15", "2026-04-15", "2026-07-15", "2026-10-15"]);
    });
  });

  describe("bounds", () => {
    const monthlyOn25 = schedule([version({ effectiveFrom: SALARY_START })], { endDate: "2026-03-25" });

    it("includes the end date", () => {
      expect(dates(generate(monthlyOn25, YEAR_2026))).toEqual(["2026-01-25", "2026-02-25", "2026-03-25"]);
    });

    it("excludes a nominal date after an end date set the day before it", () => {
      const planned = { ...monthlyOn25, endDate: "2026-03-24" };

      expect(dates(generate(planned, YEAR_2026))).toEqual(["2026-01-25", "2026-02-25"]);
    });

    it("returns exactly one occurrence for a one-off event", () => {
      const oneOff = schedule([version({ effectiveFrom: "2026-04-10", repetition: null, amount: 5000 })]);

      const occurrences = generate(oneOff, { from: "2026-01-01", to: "2030-12-31" });

      expect(occurrences).toHaveLength(1);
      expect(occurrences[0]).toMatchObject({ nominalDate: "2026-04-10", date: "2026-04-10", amount: 5000 });
    });

    it("returns nothing for a range before the start date", () => {
      expect(generate(monthlyOn25, { from: "2025-01-01", to: "2025-12-31" })).toEqual([]);
    });

    it("returns nothing for an empty range", () => {
      expect(generate(monthlyOn25, { from: "2026-03-01", to: "2026-02-01" })).toEqual([]);
    });
  });

  describe("business-day rule and range", () => {
    const lastDay = version({
      effectiveFrom: "2026-01-31",
      repetition: { kind: "monthly_on_last_day" },
      businessDayRule: "next",
    });

    it("keeps the nominal date when the business-day rule moves the date", () => {
      const [occurrence] = generate(schedule([lastDay]), { from: "2026-01-01", to: "2026-02-28" });

      expect(occurrence).toMatchObject({ nominalDate: "2026-01-31", date: "2026-02-02" });
    });

    it("decides membership of the range by the effective date, not the nominal date", () => {
      const planned = schedule([lastDay]);

      expect(generate(planned, { from: "2026-01-01", to: "2026-01-31" })).toEqual([]);
      expect(dates(generate(planned, { from: "2026-02-01", to: "2026-02-02" }))).toEqual(["2026-02-02"]);
    });

    it("includes an occurrence whose date falls in the range after a previous-day shift", () => {
      const planned = schedule([
        version({ effectiveFrom: "2026-01-01", repetition: { kind: "monthly_on_day", day: 1 }, businessDayRule: "previous" }),
      ]);

      // 1 Feb 2026 is a Sunday: the previous rule gives Friday 30 Jan.
      const occurrences = generate(planned, { from: "2026-01-30", to: "2026-01-30" });

      expect(occurrences.map((o) => [o.nominalDate, o.date])).toEqual([["2026-02-01", "2026-01-30"]]);
    });

    it("sorts by date, then by nominal date", () => {
      const planned = schedule([lastDay]);

      const occurrences = generate(planned, { from: "2026-01-01", to: "2026-04-30" });

      expect(dates(occurrences)).toEqual([...dates(occurrences)].sort());
    });
  });

  describe("overrides", () => {
    const monthly = schedule([version({ effectiveFrom: SALARY_START, amount: 100 })]);
    const range = { from: "2026-01-01", to: "2026-04-30" };

    it("moves one occurrence and leaves the others", () => {
      const override: OccurrenceOverride = {
        nominalDate: "2026-02-25",
        status: "modified",
        overrideDate: "2026-02-27",
        overrideAmount: null,
      };

      const occurrences = generate(monthly, range, [override]);

      expect(occurrences.map((o) => [o.nominalDate, o.date])).toEqual([
        ["2026-01-25", "2026-01-25"],
        ["2026-02-25", "2026-02-27"],
        ["2026-03-25", "2026-03-25"],
        ["2026-04-25", "2026-04-25"],
      ]);
    });

    it("changes one amount and flags it as overridden", () => {
      const override: OccurrenceOverride = {
        nominalDate: "2026-03-25",
        status: "modified",
        overrideDate: null,
        overrideAmount: 250,
      };

      const occurrences = generate(monthly, range, [override]);

      expect(occurrences.map((o) => [o.amount, o.isAmountOverridden])).toEqual([
        [100, false],
        [100, false],
        [250, true],
        [100, false],
      ]);
    });

    it("keeps the amount of an override with a date only", () => {
      const override: OccurrenceOverride = {
        nominalDate: "2026-02-25",
        status: "modified",
        overrideDate: "2026-02-26",
        overrideAmount: null,
      };

      const moved = generate(monthly, range, [override]).find((o) => o.nominalDate === "2026-02-25");

      expect(moved).toMatchObject({ amount: 100, isAmountOverridden: false });
    });

    it("applies the override date after the business-day rule", () => {
      const planned = schedule([
        version({ effectiveFrom: "2026-01-31", repetition: { kind: "monthly_on_last_day" }, businessDayRule: "next" }),
      ]);
      const override: OccurrenceOverride = {
        nominalDate: "2026-01-31",
        status: "modified",
        overrideDate: "2026-02-10",
        overrideAmount: null,
      };

      const [occurrence] = generate(planned, { from: "2026-02-01", to: "2026-02-28" }, [override]);

      expect(occurrence).toMatchObject({ nominalDate: "2026-01-31", date: "2026-02-10" });
    });

    it("keeps an occurrence moved far from its nominal date when the range covers the new date only", () => {
      const override: OccurrenceOverride = {
        nominalDate: "2026-01-25",
        status: "modified",
        overrideDate: "2026-04-10",
        overrideAmount: null,
      };

      const occurrences = generate(monthly, { from: "2026-04-05", to: "2026-04-15" }, [override]);

      expect(occurrences.map((o) => [o.nominalDate, o.date])).toEqual([["2026-01-25", "2026-04-10"]]);
    });

    it("has no effect for a modified override with neither a date nor an amount", () => {
      const override: OccurrenceOverride = {
        nominalDate: "2026-02-25",
        status: "modified",
        overrideDate: null,
        overrideAmount: null,
      };

      expect(generate(monthly, range, [override])).toEqual(generate(monthly, range));
    });

    it("flags only the cancelled occurrence", () => {
      const override: OccurrenceOverride = {
        nominalDate: "2026-02-25",
        status: "cancelled",
        overrideDate: null,
        overrideAmount: null,
      };

      const occurrences = generate(monthly, range, [override]);

      expect(occurrences.map((o) => [o.nominalDate, o.isCancelled])).toEqual([
        ["2026-01-25", false],
        ["2026-02-25", true],
        ["2026-03-25", false],
        ["2026-04-25", false],
      ]);
    });

    it("ignores an override for a date the schedule does not produce", () => {
      const override: OccurrenceOverride = {
        nominalDate: "2026-02-26",
        status: "cancelled",
        overrideDate: null,
        overrideAmount: null,
      };

      expect(generate(monthly, range, [override])).toEqual(generate(monthly, range));
    });
  });

  describe("cancelled schedule", () => {
    it("returns nothing after today and flags the earlier occurrences", () => {
      const planned = schedule([version({ effectiveFrom: SALARY_START })], { cancelled: true });

      const occurrences = generate(planned, { from: "2026-01-01", to: "2026-06-30" }, [], "2026-03-25");

      expect(occurrences.map((o) => [o.nominalDate, o.isCancelled])).toEqual([
        ["2026-01-25", true],
        ["2026-02-25", true],
        ["2026-03-25", true],
      ]);
    });
  });

  describe("invalid schedules", () => {
    it("throws when the versions are not sorted by effective date", () => {
      const planned = schedule([
        version({ effectiveFrom: SALARY_START }),
        version({ effectiveFrom: "2026-06-01" }),
        version({ effectiveFrom: "2026-03-01" }),
      ]);

      expect(() => generate(planned, YEAR_2026)).toThrow(Error);
    });

    it("throws when two versions share an effective date", () => {
      const planned = schedule([
        version({ effectiveFrom: SALARY_START }),
        version({ effectiveFrom: "2026-03-01" }),
        version({ effectiveFrom: "2026-03-01" }),
      ]);

      expect(() => generate(planned, YEAR_2026)).toThrow(Error);
    });

    it("throws for a schedule without version", () => {
      const planned = schedule([], { startDate: SALARY_START });

      expect(() => generate(planned, YEAR_2026)).toThrow(Error);
    });

    it("throws when the first version is not effective on the start date", () => {
      const planned = schedule([version({ effectiveFrom: "2026-02-01" })], { startDate: SALARY_START });

      expect(() => generate(planned, YEAR_2026)).toThrow(Error);
    });
  });
});
