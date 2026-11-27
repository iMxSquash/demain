import { describe, expect, it } from "vitest";

import { customEndBounds, horizonRange, parseHorizon } from "../../src/domain/horizon";

const TODAY = "2026-11-26";
const INVALID = {
  ok: false,
  error: { key: "horizonInvalid", values: { min: "2026-12-26", max: "2036-11-26" } },
};

describe("horizonRange", () => {
  it("6 months ends on 2027-05-31, 12 on 2027-11-30, 24 on 2028-11-30", () => {
    expect(horizonRange({ kind: "months", months: 6 }, TODAY)).toEqual({
      from: TODAY,
      to: "2027-05-31",
    });
    expect(horizonRange({ kind: "months", months: 12 }, TODAY)).toEqual({
      from: TODAY,
      to: "2027-11-30",
    });
    expect(horizonRange({ kind: "months", months: 24 }, TODAY)).toEqual({
      from: TODAY,
      to: "2028-11-30",
    });
  });

  it("a custom horizon ends on its date", () => {
    expect(horizonRange({ kind: "custom", endDate: "2027-02-14" }, TODAY)).toEqual({
      from: TODAY,
      to: "2027-02-14",
    });
  });
});

describe("customEndBounds", () => {
  it("runs from one month to ten years after today", () => {
    expect(customEndBounds(TODAY)).toEqual({ min: "2026-12-26", max: "2036-11-26" });
  });

  it("clamps the bounds to the end of a shorter month", () => {
    expect(customEndBounds("2027-01-31")).toEqual({ min: "2027-02-28", max: "2037-01-31" });
  });
});

describe("parseHorizon", () => {
  it("a custom end on 2026-12-25 is refused and 2026-12-26 is accepted", () => {
    expect(parseHorizon({ h: "custom", end: "2026-12-25" }, TODAY)).toEqual(INVALID);
    expect(parseHorizon({ h: "custom", end: "2026-12-26" }, TODAY)).toEqual({
      ok: true,
      choice: { kind: "custom", endDate: "2026-12-26" },
    });
  });

  it("a custom end on 2036-11-26 is accepted and 2036-11-27 is refused", () => {
    expect(parseHorizon({ h: "custom", end: "2036-11-26" }, TODAY)).toEqual({
      ok: true,
      choice: { kind: "custom", endDate: "2036-11-26" },
    });
    expect(parseHorizon({ h: "custom", end: "2036-11-27" }, TODAY)).toEqual(INVALID);
  });

  it("a missing horizon is 12 months; an unknown one is refused with a message key", () => {
    expect(parseHorizon({}, TODAY)).toEqual({ ok: true, choice: { kind: "months", months: 12 } });
    expect(parseHorizon({ h: "3" }, TODAY)).toEqual(INVALID);
  });

  it("reads each preset exactly", () => {
    expect(parseHorizon({ h: "6" }, TODAY)).toEqual({
      ok: true,
      choice: { kind: "months", months: 6 },
    });
    expect(parseHorizon({ h: "24" }, TODAY)).toEqual({
      ok: true,
      choice: { kind: "months", months: 24 },
    });
    expect(parseHorizon({ h: "06" }, TODAY)).toEqual(INVALID);
    expect(parseHorizon({ h: " 12" }, TODAY)).toEqual(INVALID);
  });

  it("refuses a custom horizon without an end or with a malformed one", () => {
    expect(parseHorizon({ h: "custom" }, TODAY)).toEqual(INVALID);
    expect(parseHorizon({ h: "custom", end: "2027-02-30" }, TODAY)).toEqual(INVALID);
    expect(parseHorizon({ h: "custom", end: "27-01-01" }, TODAY)).toEqual(INVALID);
  });
});
