import { describe, expect, it } from "vitest";

import type { PlannedItemVersion } from "../../../src/ledger/planned-items";
import {
  accountTextOf,
  categoryOptionsOf,
  scheduleText,
  versionScheduleText,
  type ScheduleTranslate,
} from "../../../src/app/planned/planned-item-view";

// Stands in for the translator: the text is the key followed by its values.
const translate: ScheduleTranslate = (key, values = {}) =>
  `${key}:${Object.entries(values)
    .map(([name, value]) => `${name}=${value}`)
    .join(",")}`;

type RepetitionKind = PlannedItemVersion["repetitionKind"];

function itemOf(
  repetitionKind: RepetitionKind,
  repetitionValue: number | null,
  endDate: string | null = null,
) {
  return {
    id: 1,
    startDate: "2027-03-05",
    endDate,
    versions: [{ effectiveFrom: "2027-03-05", repetitionKind, repetitionValue }],
  };
}

const TODAY = "2027-06-01";

describe("scheduleText", () => {
  it("words a one-off event with its date", () => {
    expect(scheduleText(translate, "en", itemOf(null, null), TODAY)).toBe(
      "schedule.once:date=Mar 5, 2027",
    );
  });

  it.each<[RepetitionKind, number | null, string]>([
    ["monthly_on_day", 12, "schedule.monthlyOnDay:day=12"],
    ["monthly_on_last_day", null, "schedule.monthlyOnLastDay:"],
    ["every_n_months", 2, "schedule.everyNMonths:months=2"],
    ["quarterly", null, "schedule.quarterly:"],
    ["yearly", null, "schedule.yearly:"],
    ["every_n_weeks", 3, "schedule.everyNWeeks:weeks=3"],
  ])("words the repetition %s", (kind, value, expected) => {
    expect(scheduleText(translate, "en", itemOf(kind, value), TODAY)).toBe(expected);
  });

  it("adds the end date of a repeating item", () => {
    expect(scheduleText(translate, "en", itemOf("yearly", null, "2030-12-31"), TODAY)).toBe(
      "schedule.until:schedule=schedule.yearly:,date=Dec 31, 2030",
    );
  });
});

describe("scheduleText across versions", () => {
  const item = {
    startDate: "2027-03-05",
    endDate: null,
    versions: [
      { effectiveFrom: "2027-03-05", repetitionKind: "yearly" as const, repetitionValue: null },
      { effectiveFrom: "2027-09-01", repetitionKind: "every_n_weeks" as const, repetitionValue: 2 },
    ],
  };

  it("words the version in effect today, not the last one", () => {
    expect(scheduleText(translate, "en", item, "2027-08-31")).toBe("schedule.yearly:");
  });

  it("words the new version from its effective date", () => {
    expect(scheduleText(translate, "en", item, "2027-09-01")).toBe("schedule.everyNWeeks:weeks=2");
  });

  it("refuses an item without any version, which is corrupted data", () => {
    expect(() => scheduleText(translate, "en", { ...item, versions: [] }, TODAY)).toThrow(RangeError);
  });
});

describe("versionScheduleText", () => {
  it("words a one-off version with the start date of the item", () => {
    expect(
      versionScheduleText(translate, "en", "2027-03-05", { repetitionKind: null, repetitionValue: null }),
    ).toBe("schedule.once:date=Mar 5, 2027");
  });
});

describe("accountTextOf", () => {
  const names = new Map([
    [1, "Current"],
    [2, "Savings A"],
  ]);
  const transferText = ({ from, to }: { from: string; to: string }) => `${from} to ${to}`;

  it("names the account of an item that is not a transfer", () => {
    expect(
      accountTextOf({ accountId: 1, destinationAccountId: null }, names, transferText),
    ).toBe("Current");
  });

  it("names both accounts of a transfer", () => {
    expect(accountTextOf({ accountId: 1, destinationAccountId: 2 }, names, transferText)).toBe(
      "Current to Savings A",
    );
  });
});

describe("categoryOptionsOf", () => {
  const categories = [
    { id: 1, name: "Housing", archived: false },
    { id: 2, name: "Old hobby", archived: true },
    { id: 3, name: "Old gym", archived: true },
  ];
  const archivedName = (name: string) => `${name} (archived)`;

  it("offers the active categories and no archived one", () => {
    expect(categoryOptionsOf(categories, null, archivedName)).toEqual([
      { id: 1, name: "Housing" },
    ]);
  });

  it("keeps the archived category the item already has, worded as archived", () => {
    expect(categoryOptionsOf(categories, 2, archivedName)).toEqual([
      { id: 1, name: "Housing" },
      { id: 2, name: "Old hobby (archived)" },
    ]);
  });
});
