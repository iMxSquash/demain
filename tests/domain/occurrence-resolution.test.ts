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
      const smallerPayment = link("2026-03-05", { amount: -10000 });

      const resolved = resolveOccurrences(
        item(),
        [smallerPayment],
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

  describe("rolling average amount", () => {
    const STARTING_ESTIMATE = 9000;
    const FAR_FUTURE_START = "2026-01-01";

    // Occurrences fall on the 5th of each month from March 2026: index 0 is 2026-03-05.
    function occurrenceDate(index: number): string {
      const month = 3 + index;
      const year = 2026 + Math.floor((month - 1) / 12);
      const monthInYear = ((month - 1) % 12) + 1;
      return `${year}-${String(monthInYear).padStart(2, "0")}-05`;
    }

    function paid(index: number, amount: number): OccurrenceLink {
      return link(occurrenceDate(index), { transactionId: index + 1, amount });
    }

    function rollingVersion(overrides: Partial<PlannedVersion> = {}): PlannedVersion {
      return version({ amount: STARTING_ESTIMATE, amountMode: "rolling_average", ...overrides });
    }

    function rollingItem(
      versionOverrides: Partial<PlannedVersion> = {},
      itemOverrides: Partial<ResolutionItem> = {},
    ): ResolutionItem {
      return item({ schedule: schedule({ versions: [rollingVersion(versionOverrides)] }), ...itemOverrides });
    }

    const expectedAmounts = (occurrences: ResolvedOccurrence[]) =>
      occurrences.map((occurrence) => occurrence.expectedAmount);

    it("nothing paid yet: every occurrence is the starting estimate", () => {
      const resolved = resolveOccurrences(rollingItem(), [], MARCH_TO_JUNE, FAR_FUTURE_START);

      expect(expectedAmounts(resolved)).toEqual([9000, 9000, 9000, 9000]);
      expect(resolved.map((occurrence) => occurrence.remaining)).toEqual([9000, 9000, 9000, 9000]);
    });

    it("occurrence 1 paid 10000: the next three are 10000", () => {
      const resolved = resolveOccurrences(rollingItem(), [paid(0, 10000)], MARCH_TO_JUNE, "2026-03-06");

      expect(expectedAmounts(resolved).slice(1)).toEqual([10000, 10000, 10000]);
    });

    it("occurrences 2 and 3 paid 11000 and 12000: occurrence 4 is 11000", () => {
      const links = [paid(0, 10000), paid(1, 11000), paid(2, 12000)];

      const resolved = resolveOccurrences(rollingItem(), links, MARCH_TO_JUNE, "2026-05-06");

      expect(resolved[3]?.expectedAmount).toBe(11000);
    });

    it("skips a cancelled occurrence", () => {
      const cancelled = override(occurrenceDate(1), { status: "cancelled" });
      const links = [paid(0, 10000), paid(2, 12000)];

      const resolved = resolveOccurrences(rollingItem({}, { overrides: [cancelled] }), links, MARCH_TO_JUNE, "2026-05-06");

      expect(resolved[1]?.status).toBe("cancelled");
      // Counting the cancelled occurrence would give 10667.
      expect(resolved[3]?.expectedAmount).toBe(11000);
    });

    it("skips an overdue occurrence", () => {
      const links = [paid(0, 10000), paid(2, 12000)];

      const resolved = resolveOccurrences(rollingItem(), links, MARCH_TO_JUNE, "2026-05-06");

      expect(resolved[1]?.status).toBe("overdue");
      // Counting the overdue occurrence at its estimate would give 10667.
      expect(resolved[3]?.expectedAmount).toBe(11000);
    });

    it("restarts the average on a new version with its own starting estimate", () => {
      const restarted = schedule({
        versions: [
          rollingVersion(),
          rollingVersion({ effectiveFrom: occurrenceDate(3), amount: 5000 }),
        ],
      });
      const links = [paid(0, 10000), paid(1, 11000), paid(2, 12000)];
      const range = { from: "2026-03-01", to: "2026-07-31" };

      const resolved = resolveOccurrences(item({ schedule: restarted }), links, range, "2026-05-06");

      expect(expectedAmounts(resolved).slice(3)).toEqual([5000, 5000]);
    });

    it("an override amount is used once and does not feed the next occurrence", () => {
      const repriced = override(occurrenceDate(1), { overrideAmount: 20000 });

      const resolved = resolveOccurrences(rollingItem({}, { overrides: [repriced] }), [], MARCH_TO_JUNE, FAR_FUTURE_START);

      expect(expectedAmounts(resolved)).toEqual([9000, 20000, 9000, 9000]);
    });

    it("averages fewer values when fewer exist", () => {
      const links = [paid(0, 10000), paid(1, 11000)];

      const resolved = resolveOccurrences(rollingItem(), links, MARCH_TO_JUNE, "2026-04-06");

      // Occurrence 3 averages 10000 and 11000, occurrence 4 averages 10000, 11000 and 10500.
      expect(expectedAmounts(resolved).slice(2)).toEqual([10500, 10500]);
    });

    it("rounds to the nearest minor unit, ties away from zero, for a negative expense", () => {
      const links = [paid(0, -1000), paid(1, -1001)];

      const resolved = resolveOccurrences(rollingItem({ amount: -9000 }), links, MARCH_TO_JUNE, "2026-04-06");

      // The exact average is -1000.5.
      expect(resolved[2]?.expectedAmount).toBe(-1001);
    });

    it("a window of 6 and of 12", () => {
      const sixPaid = [0, 1, 2, 3, 4, 5, 6].map((index) => paid(index, (index + 1) * 1000));
      const sixRange = { from: "2026-03-01", to: "2026-10-31" };
      const twelvePaid = Array.from({ length: 12 }, (_, index) => paid(index, (index + 1) * 1000));
      const twelveRange = { from: "2026-03-01", to: "2027-03-31" };

      const withSix = resolveOccurrences(rollingItem({ averageWindow: 6 }), sixPaid, sixRange, "2026-09-06");
      const withTwelve = resolveOccurrences(
        rollingItem({ averageWindow: 12 }),
        twelvePaid,
        twelveRange,
        "2027-02-06",
      );

      // Average of 2000..7000, then of 1000..12000.
      expect(withSix[7]?.expectedAmount).toBe(4500);
      expect(withTwelve[12]?.expectedAmount).toBe(6500);
    });

    it("a fixed version after a rolling one freezes the amount", () => {
      const frozen = schedule({
        versions: [rollingVersion(), version({ effectiveFrom: occurrenceDate(2), amount: 7000 })],
      });
      const links = [paid(0, 10000), paid(1, 11000)];
      const range = { from: "2026-03-01", to: "2026-07-31" };

      const resolved = resolveOccurrences(item({ schedule: frozen }), links, range, "2026-04-06");

      expect(expectedAmounts(resolved).slice(2)).toEqual([7000, 7000, 7000]);
    });

    it("fills the window from before the range", () => {
      const links = [paid(0, 10000), paid(1, 11000), paid(2, 12000), paid(3, 13000)];
      const julyOnly = { from: "2026-07-01", to: "2026-07-31" };

      const resolved = resolveOccurrences(rollingItem(), links, julyOnly, "2026-06-06");

      // Occurrences 2, 3 and 4 (11000, 12000, 13000), not 1.
      expect(expectedAmounts(resolved)).toEqual([12000]);
    });

    it("converges toward a weighted average with rounding at every step", () => {
      const links = [paid(0, 8000), paid(1, 9000), paid(2, 10000)];
      const range = { from: "2026-03-01", to: "2026-10-31" };

      const resolved = resolveOccurrences(rollingItem(), links, range, "2026-05-06");

      expect(expectedAmounts(resolved).slice(3)).toEqual([9000, 9333, 9444, 9259, 9345]);
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

describe("resolveOccurrences, provisions", () => {
  const FUEL_RANGE = MARCH;
  const fuelVersion = (overrides: Partial<PlannedVersion> = {}) =>
    version({
      effectiveFrom: "2026-03-15",
      repetition: { kind: "monthly_on_day", day: 15 },
      amount: -9000,
      ...overrides,
    });
  const fuel = (overrides: Partial<ResolutionItem> = {}, versionOverrides: Partial<PlannedVersion> = {}) =>
    item({
      schedule: schedule({ startDate: "2026-03-15", versions: [fuelVersion(versionOverrides)] }),
      acceptsMultipleTransactions: true,
      ...overrides,
    });
  const fillUp = (amount: number, transactionId: number, overrides: Partial<OccurrenceLink> = {}) =>
    link("2026-03-15", { transactionId, amount, date: "2026-03-12", ...overrides });
  const resolveFuel = (today: string, links: OccurrenceLink[] = [], overrides: Partial<ResolutionItem> = {}) => {
    const [first] = resolveOccurrences(fuel(overrides), links, FUEL_RANGE, today);
    if (first === undefined) throw new Error("No occurrence resolved");
    return first;
  };

  it("a provision of 90 with fill-ups of 30 and 25 has 35 remaining and is partial", () => {
    const resolved = resolveFuel("2026-03-20", [fillUp(-3000, 1), fillUp(-2500, 2)]);

    expect(resolved.linkedSum).toBe(-5500);
    expect(resolved.remaining).toBe(-3500);
    expect(resolved.status).toBe("partial");
  });

  it("a further fill-up of 50 leaves 0 remaining, never negative, and confirms it", () => {
    const resolved = resolveFuel("2026-03-20", [fillUp(-3000, 1), fillUp(-2500, 2), fillUp(-5000, 3)]);

    expect(resolved.linkedSum).toBe(-10500);
    expect(resolved.remaining).toBe(0);
    expect(resolved.status).toBe("confirmed");
  });

  it("is confirmed as soon as the linked sum reaches the expected amount", () => {
    const resolved = resolveFuel("2026-03-20", [fillUp(-9000, 1)]);

    expect(resolved.remaining).toBe(0);
    expect(resolved.status).toBe("confirmed");
  });

  it("after its period, a provision with one fill-up is confirmed and its leftover is 0", () => {
    const resolved = resolveFuel("2026-04-01", [fillUp(-3000, 1)]);

    expect(resolved.status).toBe("confirmed");
    expect(resolved.remaining).toBe(0);
  });

  it("after its period, a provision without fill-up is overdue", () => {
    const resolved = resolveFuel("2026-04-01");

    expect(resolved.status).toBe("overdue");
    expect(resolved.remaining).toBe(0);
  });

  it("stays planned with the full amount remaining before its period ends and has no link", () => {
    const resolved = resolveFuel("2026-03-31");

    expect(resolved.status).toBe("planned");
    expect(resolved.remaining).toBe(-9000);
  });

  it("is still partial on the last day of the period and settled the day after", () => {
    const links = [fillUp(-3000, 1)];

    expect(resolveFuel("2026-03-31", links)).toMatchObject({ status: "partial", remaining: -6000 });
    expect(resolveFuel("2026-04-01", links)).toMatchObject({ status: "confirmed", remaining: 0 });
  });

  it("does not use the matching window: a provision without fill-up is not overdue after the window", () => {
    expect(resolveFuel("2026-03-25").status).toBe("planned");
  });

  it("an income provision keeps its positive sign", () => {
    const income = fuel({}, { amount: 9000 });
    const [partial] = resolveOccurrences(income, [fillUp(3000, 1)], FUEL_RANGE, "2026-03-20");
    const [over] = resolveOccurrences(income, [fillUp(3000, 1), fillUp(7000, 2)], FUEL_RANGE, "2026-03-20");

    expect(partial).toMatchObject({ remaining: 6000, status: "partial" });
    expect(over).toMatchObject({ remaining: 0, status: "confirmed" });
  });

  it("an override amount is the expected amount of the provision", () => {
    const overridden = fuel({ overrides: [override("2026-03-15", { overrideAmount: -6000 })] });
    const [resolved] = resolveOccurrences(overridden, [fillUp(-3000, 1)], FUEL_RANGE, "2026-03-20");

    expect(resolved).toMatchObject({ expectedAmount: -6000, remaining: -3000, status: "partial" });
  });

  it("a cancelled provision without fill-up is cancelled", () => {
    const cancelled = fuel({ overrides: [override("2026-03-15", { status: "cancelled" })] });
    const [resolved] = resolveOccurrences(cancelled, [], FUEL_RANGE, "2026-03-20");

    expect(resolved?.status).toBe("cancelled");
  });

  it("a cancelled provision with a fill-up follows the provision rules", () => {
    const cancelled = fuel({ overrides: [override("2026-03-15", { status: "cancelled" })] });
    const [resolved] = resolveOccurrences(cancelled, [fillUp(-3000, 1)], FUEL_RANGE, "2026-03-20");

    expect(resolved).toMatchObject({ status: "partial", remaining: -6000 });
  });

  it("the linked sum is the reference value of a rolling-average provision", () => {
    const rolling = fuel({}, { amountMode: "rolling_average", averageWindow: 3 });

    const resolved = resolveOccurrences(
      rolling,
      [fillUp(-3000, 1), fillUp(-2500, 2)],
      MARCH_TO_APRIL,
      "2026-04-01",
    );

    expect(resolved.map((occurrence) => occurrence.expectedAmount)).toEqual([-9000, -5500]);
  });

  it("a partial provision feeds the rolling average with its estimate, not its partial sum", () => {
    const rolling = fuel({}, { amountMode: "rolling_average", averageWindow: 3 });

    const resolved = resolveOccurrences(rolling, [fillUp(-3000, 1)], MARCH_TO_APRIL, "2026-03-20");

    expect(resolved.map((occurrence) => occurrence.expectedAmount)).toEqual([-9000, -9000]);
  });

  it("never produces partial for a regular occurrence", () => {
    const partialLink = link("2026-03-05", { amount: -10000 });
    const resolved = resolveOccurrences(item(), [partialLink], MARCH_TO_APRIL, "2026-03-06");

    expect(statuses(resolved)).toEqual(["confirmed", "planned"]);
    expect(resolved[0]?.remaining).toBe(0);
  });

  describe("period of the occurrence", () => {
    const biweekly = (startDate: string) =>
      item({
        schedule: schedule({
          startDate,
          versions: [version({ effectiveFrom: startDate, repetition: { kind: "every_n_weeks", weeks: 2 } })],
        }),
        acceptsMultipleTransactions: true,
      });

    it("starts the day after the previous occurrence, even when it is before the range", () => {
      const resolved = resolveOccurrences(
        biweekly("2026-03-06"),
        [],
        { from: "2026-03-20", to: "2026-03-20" },
        "2026-03-01",
      );

      expect(resolved.map((occurrence) => occurrence.period)).toEqual([{ from: "2026-03-07", to: "2026-03-20" }]);
    });

    it("has the length of the other periods for the first occurrence of the schedule", () => {
      const resolved = resolveOccurrences(biweekly("2026-03-20"), [], MARCH, "2026-03-01");

      expect(resolved[0]?.period).toEqual({ from: "2026-03-07", to: "2026-03-20" });
    });

    it("is the calendar month for a monthly provision", () => {
      expect(resolveFuel("2026-03-01").period).toEqual({ from: "2026-03-01", to: "2026-03-31" });
    });

    it("is null for a regular occurrence", () => {
      const [regular] = resolveOccurrences(item(), [], MARCH, "2026-03-01");

      expect(regular?.period).toBeNull();
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
