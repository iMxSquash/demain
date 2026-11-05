import { describe, expect, it } from "vitest";

import {
  lastDayOfMonth,
  planSummaryAssertions,
} from "../../src/domain/summary-assertions";

const ACCOUNT = { id: 7, openingDate: "2025-03-15", archived: false };
const TODAY = "2026-05-10";

describe("lastDayOfMonth", () => {
  it.each([
    ["2026-01", "2026-01-31"],
    ["2026-04", "2026-04-30"],
    ["2026-02", "2026-02-28"],
    ["2028-02", "2028-02-29"],
    ["2100-02", "2100-02-28"],
    ["2000-02", "2000-02-29"],
    ["2026-12", "2026-12-31"],
  ])("gives the last day of %s", (month, expected) => {
    expect(lastDayOfMonth(month)).toBe(expected);
  });
});

describe("planSummaryAssertions", () => {
  it("creates one assertion per month at its last day", () => {
    const plan = planSummaryAssertions(
      [
        { month: "2025-04", amount: 1_000 },
        { month: "2026-02", amount: -50 },
      ],
      ACCOUNT,
      TODAY,
    );

    expect(plan).toEqual({
      assertions: [
        { accountId: 7, date: "2025-04-30", amount: 1_000 },
        { accountId: 7, date: "2026-02-28", amount: -50 },
      ],
      withoutBalance: [],
      refused: [],
    });
  });

  it("names the months without a balance and creates nothing for them", () => {
    const plan = planSummaryAssertions(
      [{ month: "2025-04", amount: null }],
      ACCOUNT,
      TODAY,
    );

    expect(plan).toEqual({
      assertions: [],
      withoutBalance: ["2025-04"],
      refused: [],
    });
  });

  it("refuses a month that ended before the account opened", () => {
    const plan = planSummaryAssertions(
      [
        { month: "2025-02", amount: 1 },
        { month: "2025-03", amount: 2 },
      ],
      ACCOUNT,
      TODAY,
    );

    expect(plan.refused).toEqual([{ month: "2025-02", reason: "beforeOpening" }]);
    // The opening month ends after the opening day: it is accepted.
    expect(plan.assertions.map((a) => a.date)).toEqual(["2025-03-31"]);
  });

  it("accepts a month whose last day is the opening day", () => {
    const plan = planSummaryAssertions(
      [{ month: "2025-03", amount: 1 }],
      { ...ACCOUNT, openingDate: "2025-03-31" },
      TODAY,
    );

    expect(plan.assertions).toHaveLength(1);
  });

  it("refuses a month whose last day is after today, the current one included", () => {
    const plan = planSummaryAssertions(
      [
        { month: "2026-04", amount: 1 },
        { month: "2026-05", amount: 2 },
        { month: "2026-06", amount: 3 },
      ],
      ACCOUNT,
      TODAY,
    );

    expect(plan.assertions.map((a) => a.date)).toEqual(["2026-04-30"]);
    expect(plan.refused).toEqual([
      { month: "2026-05", reason: "afterToday" },
      { month: "2026-06", reason: "afterToday" },
    ]);
  });

  it("accepts a month ending today", () => {
    const plan = planSummaryAssertions(
      [{ month: "2026-05", amount: 1 }],
      ACCOUNT,
      "2026-05-31",
    );

    expect(plan.assertions).toHaveLength(1);
  });

  it("refuses every month with a balance on an archived account", () => {
    const plan = planSummaryAssertions(
      [
        { month: "2025-04", amount: 1 },
        { month: "2025-05", amount: null },
      ],
      { ...ACCOUNT, archived: true },
      TODAY,
    );

    expect(plan).toEqual({
      assertions: [],
      withoutBalance: ["2025-05"],
      refused: [{ month: "2025-04", reason: "accountArchived" }],
    });
  });
});
