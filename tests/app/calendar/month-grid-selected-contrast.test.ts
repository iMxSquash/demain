// Regression: the selected cell fills with `bg-primary`, so any text that inherits the link's
// `text-text` is ink on ink (light) or white on white (dark). The link itself must switch to
// `on-primary` when selected so that every inheriting child follows, and the accent "Today"
// label, which sets its own colour, must switch as well.
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MonthGrid, type MonthGridText } from "../../../src/app/calendar/month-grid";
import type { CalendarDay, CalendarMonth } from "../../../src/ledger/calendar";

const TEXT: MonthGridText = {
  label: "November 2026",
  today: "Today",
  belowZero: "Below zero",
  unplacedSurplus: "Unplaced surplus",
  real: (count) => `${count} real`,
  planned: (count) => `${count} planned`,
  name: {
    today: "today",
    balance: "end-of-day balance",
    noEntries: "no entries",
    belowZero: "below zero",
    unplacedSurplus: "unplaced surplus",
  },
  legend: "Dot: real, ring: planned",
};

const SELECTED_TEXT = "group-data-[selected=true]:text-on-primary";

const month: CalendarMonth = {
  month: "2026-11",
  currency: "EUR",
  days: Array.from({ length: 30 }, (_, index): CalendarDay => ({
    date: `2026-11-${String(index + 1).padStart(2, "0")}`,
    entries: [],
    balance: 100_000,
    isBelowZero: false,
  })),
  firstDayBelowZero: null,
  unconvertedCurrencies: [],
};

const html = renderToString(
  createElement(MonthGrid, {
    month,
    locale: "en",
    today: "2026-11-21",
    linesHref: (date) => `/l#${date}`,
    text: TEXT,
  }),
);

const classesOf = (tag: string) => (/\sclass="([^"]*)"/.exec(tag)?.[1] ?? "").split(" ");
const linkTags = [...html.matchAll(/<a\s[^>]*>/g)].map((match) => match[0]);

describe("month grid selected-state text classes", () => {
  it("gives every day link the selected-state text class", () => {
    expect(linkTags).toHaveLength(30);
    for (const tag of linkTags) {
      expect(classesOf(tag)).toContain(SELECTED_TEXT);
    }
  });

  it("gives the Today label the selected-state text class", () => {
    const label = [...html.matchAll(/<span\s[^>]*>Today<\/span>/g)].map((match) => match[0]);

    expect(label).toHaveLength(1);
    expect(classesOf(label[0] ?? "")).toContain(SELECTED_TEXT);
  });
});
