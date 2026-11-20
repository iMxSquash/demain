import { describe, expect, it } from "vitest";

import type { PlannedItemVersion } from "../../../src/ledger/planned-items";
import {
  accountTextOf,
  categoryOptionsOf,
  currentVersionOf,
  scheduleText,
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
    versions: [{ repetitionKind, repetitionValue }],
  };
}

describe("scheduleText", () => {
  it("words a one-off event with its date", () => {
    expect(scheduleText(translate, "en", itemOf(null, null))).toBe(
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
    expect(scheduleText(translate, "en", itemOf(kind, value))).toBe(expected);
  });

  it("adds the end date of a repeating item", () => {
    expect(scheduleText(translate, "en", itemOf("yearly", null, "2030-12-31"))).toBe(
      "schedule.until:schedule=schedule.yearly:,date=Dec 31, 2030",
    );
  });
});

describe("currentVersionOf", () => {
  it("returns the last version", () => {
    expect(currentVersionOf({ id: 1, versions: ["first", "second"] })).toBe("second");
  });

  it("refuses an item without any version, which is corrupted data", () => {
    expect(() => currentVersionOf({ id: 7, versions: [] })).toThrow("Planned item 7 has no version");
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
