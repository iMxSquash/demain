import { describe, expect, it } from "vitest";

import {
  isProvisionCandidate,
  provisionPeriod,
  type ProvisionCandidateTransaction,
  type ProvisionItem,
} from "../../src/domain/provision";

describe("provisionPeriod", () => {
  it("the period of a monthly provision is its calendar month", () => {
    expect(provisionPeriod("2028-02-15", "2028-01-15", { kind: "monthly_on_day", day: 15 })).toEqual({
      from: "2028-02-01",
      to: "2028-02-29",
    });
  });

  it("a monthly provision on the last day covers its calendar month", () => {
    expect(provisionPeriod("2026-04-30", "2026-03-31", { kind: "monthly_on_last_day" })).toEqual({
      from: "2026-04-01",
      to: "2026-04-30",
    });
  });

  it("the period of a monthly provision ignores the previous date and its absence", () => {
    expect(provisionPeriod("2026-03-15", null, { kind: "monthly_on_day", day: 15 })).toEqual({
      from: "2026-03-01",
      to: "2026-03-31",
    });
  });

  it("every 1 month counts as monthly", () => {
    expect(provisionPeriod("2026-03-15", "2026-02-15", { kind: "every_n_months", months: 1 })).toEqual({
      from: "2026-03-01",
      to: "2026-03-31",
    });
  });

  it("every 2 months does not count as monthly", () => {
    expect(provisionPeriod("2026-03-15", "2026-01-15", { kind: "every_n_months", months: 2 })).toEqual({
      from: "2026-01-16",
      to: "2026-03-15",
    });
  });

  it("the period of an every-2-weeks provision starts the day after the previous date", () => {
    expect(provisionPeriod("2026-03-20", "2026-03-06", { kind: "every_n_weeks", weeks: 2 })).toEqual({
      from: "2026-03-07",
      to: "2026-03-20",
    });
  });

  it("a quarterly provision runs from the day after the previous date", () => {
    expect(provisionPeriod("2026-06-10", "2026-03-10", { kind: "quarterly" })).toEqual({
      from: "2026-03-11",
      to: "2026-06-10",
    });
  });

  it("a yearly provision runs from the day after the previous date", () => {
    expect(provisionPeriod("2027-05-01", "2026-05-01", { kind: "yearly" })).toEqual({
      from: "2026-05-02",
      to: "2027-05-01",
    });
  });

  describe("first period, as if an occurrence existed one repetition earlier", () => {
    it("every 2 weeks", () => {
      expect(provisionPeriod("2026-03-20", null, { kind: "every_n_weeks", weeks: 2 })).toEqual({
        from: "2026-03-07",
        to: "2026-03-20",
      });
    });

    it("quarterly", () => {
      expect(provisionPeriod("2026-06-10", null, { kind: "quarterly" })).toEqual({
        from: "2026-03-11",
        to: "2026-06-10",
      });
    });

    it("yearly", () => {
      expect(provisionPeriod("2027-05-01", null, { kind: "yearly" })).toEqual({
        from: "2026-05-02",
        to: "2027-05-01",
      });
    });

    it("every 2 months", () => {
      expect(provisionPeriod("2026-03-15", null, { kind: "every_n_months", months: 2 })).toEqual({
        from: "2026-01-16",
        to: "2026-03-15",
      });
    });

    it("every 1 month is the calendar month", () => {
      expect(provisionPeriod("2026-03-15", null, { kind: "every_n_months", months: 1 })).toEqual({
        from: "2026-03-01",
        to: "2026-03-31",
      });
    });

    it("clamps the previous day to the length of its month", () => {
      expect(provisionPeriod("2026-05-31", null, { kind: "every_n_months", months: 3 })).toEqual({
        from: "2026-03-01",
        to: "2026-05-31",
      });
    });
  });
});

describe("isProvisionCandidate", () => {
  const PERIOD = { from: "2026-03-01", to: "2026-03-31" };
  const provision: ProvisionItem = { accountId: 1, categoryId: 10, provisionLabelFilter: "carburant" };

  function transaction(overrides: Partial<ProvisionCandidateTransaction> = {}): ProvisionCandidateTransaction {
    return {
      accountId: 1,
      categoryId: 10,
      date: "2026-03-12",
      label: "Plein carburant",
      kind: "expense",
      ...overrides,
    };
  }

  it("a candidate must be on the same account, in the category, in the period, and contain the filter", () => {
    expect(isProvisionCandidate(transaction(), provision, PERIOD)).toBe(true);
  });

  it("refuses another account", () => {
    expect(isProvisionCandidate(transaction({ accountId: 2 }), provision, PERIOD)).toBe(false);
  });

  it("refuses another category", () => {
    expect(isProvisionCandidate(transaction({ categoryId: 11 }), provision, PERIOD)).toBe(false);
  });

  it("refuses an uncategorized transaction", () => {
    expect(isProvisionCandidate(transaction({ categoryId: null }), provision, PERIOD)).toBe(false);
  });

  it("refuses a date before the period", () => {
    expect(isProvisionCandidate(transaction({ date: "2026-02-28" }), provision, PERIOD)).toBe(false);
  });

  it("refuses a date after the period", () => {
    expect(isProvisionCandidate(transaction({ date: "2026-04-01" }), provision, PERIOD)).toBe(false);
  });

  it("refuses a label without the filter", () => {
    expect(isProvisionCandidate(transaction({ label: "Courses" }), provision, PERIOD)).toBe(false);
  });

  it("accepts the first day of the period", () => {
    expect(isProvisionCandidate(transaction({ date: "2026-03-01" }), provision, PERIOD)).toBe(true);
  });

  it("accepts the last day of the period", () => {
    expect(isProvisionCandidate(transaction({ date: "2026-03-31" }), provision, PERIOD)).toBe(true);
  });

  it("accepts any label when there is no filter", () => {
    const unfiltered = { ...provision, provisionLabelFilter: null };

    expect(isProvisionCandidate(transaction({ label: "Anything" }), unfiltered, PERIOD)).toBe(true);
  });

  it("the filter ignores case", () => {
    expect(isProvisionCandidate(transaction({ label: "PLEIN CARBURANT" }), provision, PERIOD)).toBe(true);
    expect(
      isProvisionCandidate(transaction(), { ...provision, provisionLabelFilter: "CARBURANT" }, PERIOD),
    ).toBe(true);
  });

  it("the filter does not fold accents, like the contains rule", () => {
    expect(isProvisionCandidate(transaction({ label: "Carbürant" }), provision, PERIOD)).toBe(false);
  });

  it("a transfer is never a candidate", () => {
    expect(isProvisionCandidate(transaction({ kind: "transfer" }), provision, PERIOD)).toBe(false);
  });
});
