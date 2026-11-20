import { describe, expect, it } from "vitest";

import type { OccurrenceOverride, PlannedSchedule, PlannedVersion } from "../../src/domain/occurrences";
import {
  findOrphanLinks,
  resolveOccurrences,
  type OccurrenceLink,
  type ResolutionItem,
  type ResolvedOccurrence,
} from "../../src/domain/occurrence-resolution";
import type { DateRange } from "../../src/domain/recurrence";

const START = "2026-03-05";
const DEFAULT_WINDOW_DAYS = 5;
const MARCH: DateRange = { from: "2026-03-01", to: "2026-03-31" };
const MARCH_TO_APRIL: DateRange = { from: "2026-03-01", to: "2026-04-30" };
const MARCH_TO_JUNE: DateRange = { from: "2026-03-01", to: "2026-06-30" };

function version(overrides: Partial<PlannedVersion> = {}): PlannedVersion {
  return {
    effectiveFrom: START,
    repetition: { kind: "monthly_on_day", day: 5 },
    businessDayRule: "none",
    amount: -45000,
    amountMode: "fixed",
    averageWindow: 3,
    ...overrides,
  };
}

function schedule(overrides: Partial<PlannedSchedule> = {}): PlannedSchedule {
  return {
    startDate: START,
    endDate: null,
    cancelled: false,
    versions: [version()],
    ...overrides,
  };
}

function item(overrides: Partial<ResolutionItem> = {}): ResolutionItem {
  return {
    schedule: schedule(),
    overrides: [],
    matchWindowDays: DEFAULT_WINDOW_DAYS,
    acceptsMultipleTransactions: false,
    ...overrides,
  };
}

function override(nominalDate: string, overrides: Partial<OccurrenceOverride> = {}): OccurrenceOverride {
  return { nominalDate, status: "modified", overrideDate: null, overrideAmount: null, ...overrides };
}

function link(occurrenceDate: string, overrides: Partial<OccurrenceLink> = {}): OccurrenceLink {
  return {
    transactionId: 1,
    occurrenceDate,
    date: occurrenceDate,
    amount: -45000,
    ...overrides,
  };
}

const statuses = (occurrences: ResolvedOccurrence[]) => occurrences.map((occurrence) => occurrence.status);

function statusOfMarchOccurrence(
  today: string,
  overrides: Partial<ResolutionItem> = {},
  links: OccurrenceLink[] = [],
) {
  const [first] = resolveOccurrences(item(overrides), links, MARCH, today);
  return first?.status;
}

describe("resolveOccurrences", () => {
  describe("status of a regular occurrence", () => {
    it("is planned before its date", () => {
      expect(statusOfMarchOccurrence("2026-03-01")).toBe("planned");
    });

    it("is planned on the last day of its window", () => {
      expect(statusOfMarchOccurrence("2026-03-10")).toBe("planned");
    });

    it("is overdue the day after its window", () => {
      expect(statusOfMarchOccurrence("2026-03-11")).toBe("overdue");
    });

    it("a window of 0 days makes it overdue the day after its date", () => {
      const noWindow = { matchWindowDays: 0 };

      expect(statusOfMarchOccurrence("2026-03-05", noWindow)).toBe("planned");
      expect(statusOfMarchOccurrence("2026-03-06", noWindow)).toBe("overdue");
    });

    it("is confirmed by a linked transaction before its date", () => {
      const early = link("2026-03-05", { date: "2026-03-02" });

      expect(statusOfMarchOccurrence("2026-03-03", {}, [early])).toBe("confirmed");
    });

    it("is confirmed by a linked transaction after its window", () => {
      const late = link("2026-03-05", { date: "2026-03-25" });

      expect(statusOfMarchOccurrence("2026-04-01", {}, [late])).toBe("confirmed");
    });

    it("uses the business-day date for the window", () => {
      // 2026-01-31 is a Saturday: the "next" rule moves it to Monday 2026-02-02.
      const lastDay = item({
        schedule: schedule({
          startDate: "2026-01-01",
          versions: [
            version({
              effectiveFrom: "2026-01-01",
              repetition: { kind: "monthly_on_last_day" },
              businessDayRule: "next",
            }),
          ],
        }),
      });
      const range = { from: "2026-02-01", to: "2026-02-15" };

      const [planned] = resolveOccurrences(lastDay, [], range, "2026-02-07");
      const [overdue] = resolveOccurrences(lastDay, [], range, "2026-02-08");

      expect(planned?.nominalDate).toBe("2026-01-31");
      expect(planned?.date).toBe("2026-02-02");
      expect(planned?.status).toBe("planned");
      expect(overdue?.status).toBe("overdue");
    });

    it("uses the override date for the window", () => {
      const moved = override("2026-03-05", { overrideDate: "2026-03-20" });

      expect(statusOfMarchOccurrence("2026-03-25", { overrides: [moved] })).toBe("planned");
      expect(statusOfMarchOccurrence("2026-03-26", { overrides: [moved] })).toBe("overdue");
    });

    it("a cancelled override gives the cancelled status", () => {
      const cancelled = override("2026-03-05", { status: "cancelled" });

      expect(statusOfMarchOccurrence("2026-03-01", { overrides: [cancelled] })).toBe("cancelled");
      expect(statusOfMarchOccurrence("2026-04-01", { overrides: [cancelled] })).toBe("cancelled");
    });

    it("a past occurrence of a cancelled item is cancelled", () => {
      const cancelledItem = item({ schedule: schedule({ cancelled: true }) });

      // A cancelled schedule keeps the occurrences on or before today and drops the later ones.
      const resolved = resolveOccurrences(cancelledItem, [], MARCH_TO_JUNE, "2026-05-10");

      expect(resolved.map((occurrence) => occurrence.nominalDate)).toEqual([
        "2026-03-05",
        "2026-04-05",
        "2026-05-05",
      ]);
      expect(statuses(resolved)).toEqual(["cancelled", "cancelled", "cancelled"]);
    });

    it("a linked transaction keeps the occurrence confirmed when the item is cancelled afterwards", () => {
      const cancelledItem = item({ schedule: schedule({ cancelled: true }) });

      const resolved = resolveOccurrences(cancelledItem, [link("2026-04-05")], MARCH_TO_JUNE, "2026-05-10");

      expect(statuses(resolved)).toEqual(["cancelled", "confirmed", "cancelled"]);
    });

    it("a linked transaction keeps the occurrence confirmed when its override is cancelled", () => {
      const cancelled = override("2026-03-05", { status: "cancelled" });

      expect(statusOfMarchOccurrence("2026-04-01", { overrides: [cancelled] }, [link("2026-03-05")])).toBe(
        "confirmed",
      );
    });

    it("today before the start date leaves every occurrence planned", () => {
      const resolved = resolveOccurrences(item(), [], MARCH_TO_JUNE, "2026-01-01");

      expect(statuses(resolved)).toEqual(["planned", "planned", "planned", "planned"]);
    });
  });

  describe("links", () => {
    it("attaches a link by nominal date even when the occurrence date is overridden", () => {
      const moved = override("2026-03-05", { overrideDate: "2026-03-20" });
      const settling = link("2026-03-05", { date: "2026-03-19" });

      const [first] = resolveOccurrences(item({ overrides: [moved] }), [settling], MARCH, "2026-04-30");

      expect(first?.status).toBe("confirmed");
      expect(first?.links).toEqual([settling]);
    });

    it("ignores a link to a nominal date the schedule does not produce", () => {
      const stray = link("2026-03-06", { transactionId: 9 });

      const resolved = resolveOccurrences(item(), [stray], MARCH, "2026-03-20");

      expect(statuses(resolved)).toEqual(["overdue"]);
      expect(resolved.flatMap((occurrence) => occurrence.links)).toEqual([]);
    });

    it("keeps a duplicate link on a regular occurrence confirmed and lists both links", () => {
      const first = link("2026-03-05", { transactionId: 1, amount: -20000 });
      const second = link("2026-03-05", { transactionId: 2, amount: -25000 });

      const [occurrence] = resolveOccurrences(item(), [first, second], MARCH, "2026-03-06");

      expect(occurrence?.status).toBe("confirmed");
      expect(occurrence?.links).toEqual([first, second]);
      expect(occurrence?.linkedSum).toBe(-45000);
    });

    it("treats an item accepting several transactions like a regular one", () => {
      const several = { acceptsMultipleTransactions: true };
      const settling = link("2026-03-05", { amount: -10000 });

      expect(statusOfMarchOccurrence("2026-03-11", several)).toBe("overdue");
      expect(statusOfMarchOccurrence("2026-03-11", several, [settling])).toBe("confirmed");
    });
  });

  describe("amounts", () => {
    it("expectedAmount is the version amount, or the override amount", () => {
      const repriced = override("2026-04-05", { overrideAmount: -50000 });

      const resolved = resolveOccurrences(
        item({ overrides: [repriced] }),
        [],
        MARCH_TO_APRIL,
        "2026-01-01",
      );

      expect(resolved.map((occurrence) => occurrence.expectedAmount)).toEqual([-45000, -50000]);
    });

    it("remaining is 0 once confirmed and the expected amount otherwise", () => {
      const partialPayment = link("2026-03-05", { amount: -10000 });

      const resolved = resolveOccurrences(
        item(),
        [partialPayment],
        MARCH_TO_APRIL,
        "2026-03-06",
      );

      const [confirmed, planned] = resolved;
      expect(confirmed?.status).toBe("confirmed");
      expect(confirmed?.linkedSum).toBe(-10000);
      expect(confirmed?.remaining).toBe(0);
      expect(planned?.status).toBe("planned");
      expect(planned?.linkedSum).toBe(0);
      expect(planned?.remaining).toBe(-45000);
    });
  });

  describe("ordering and range", () => {
    it("returns occurrences in nominal date order with their own links", () => {
      const march = link("2026-03-05", { transactionId: 1 });
      const may = link("2026-05-05", { transactionId: 2, date: "2026-05-01" });

      // Links are given out of order on purpose.
      const resolved = resolveOccurrences(item(), [may, march], MARCH_TO_JUNE, "2026-04-20");

      expect(resolved.map((occurrence) => occurrence.nominalDate)).toEqual([
        "2026-03-05",
        "2026-04-05",
        "2026-05-05",
        "2026-06-05",
      ]);
      expect(statuses(resolved)).toEqual(["confirmed", "overdue", "confirmed", "planned"]);
      expect(resolved.map((occurrence) => occurrence.links)).toEqual([[march], [], [may], []]);
    });

    it("no link and an empty range give an empty list", () => {
      const noOccurrenceRange = { from: "2026-03-10", to: "2026-03-20" };

      expect(resolveOccurrences(item(), [], noOccurrenceRange, "2026-03-15")).toEqual([]);
    });
  });
});

describe("findOrphanLinks", () => {
  it("reports a link to a nominal date the schedule does not produce", () => {
    const stray = link("2026-03-06", { transactionId: 9 });

    expect(findOrphanLinks(item(), [stray], "2026-03-20")).toEqual([stray]);
  });

  it("does not report a link attached to an occurrence", () => {
    expect(findOrphanLinks(item(), [link("2026-03-05")], "2026-03-20")).toEqual([]);
  });

  it("does not report a link on a nominal date moved by the business-day rule", () => {
    // 2026-01-31 is a Saturday: the "next" rule gives Monday 2026-02-02.
    const lastDay = item({
      schedule: schedule({
        startDate: "2026-01-01",
        versions: [
          version({
            effectiveFrom: "2026-01-01",
            repetition: { kind: "monthly_on_last_day" },
            businessDayRule: "next",
          }),
        ],
      }),
    });

    expect(findOrphanLinks(lastDay, [link("2026-01-31")], "2026-03-01")).toEqual([]);
  });

  it("does not report a link on a nominal date whose occurrence was moved far away", () => {
    const moved = override("2026-03-05", { overrideDate: "2026-09-15" });

    expect(findOrphanLinks(item({ overrides: [moved] }), [link("2026-03-05")], "2026-03-20")).toEqual([]);
  });

  it("returns an empty list without links", () => {
    expect(findOrphanLinks(item(), [], "2026-03-20")).toEqual([]);
  });
});
