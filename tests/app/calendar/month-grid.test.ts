// Contract of `MonthGrid`, exported from src/app/calendar/month-grid.tsx (issue #173, DESIGN
// section 18 "Month grid"). A server component, rendered here with renderToString.
//
// Props: { month: CalendarMonth; locale: string; today: string (YYYY-MM-DD);
//          linesHref: (date: string) => string;
//          text: MonthGridText }
//
// Markup:
// - one element `role="grid"` with `aria-label={text.label}`;
// - a header row of seven `role="columnheader"`, in the week order of the locale (`weekStartOf`),
//   each with the short weekday as text and the long one as `aria-label` (`formatWeekday`);
// - rows are `role="row"`: the header row plus one per week (`buildMonthGrid`). A day outside the
//   month is an empty cell: no `aria-label`, no link, not focusable;
// - one `role="gridcell"` per day of the month with an `aria-label` that reads, joined by ", ":
//   "{day} {month name}" [today] "{balanceLabel} {balance in currency code}" ["{n} real"]
//   ["{n} planned"] ["no entries" when there is none] [below zero] [unplaced surplus]. The words
//   come from `text.name`, the counts from `text.real(n)` and `text.planned(n)` (the plural is
//   the translation's job);
// - the cell also shows, as text: the day number, `text.today` on today, the balance with the
//   symbol (`formatAmount`), `text.belowZero` when `isBelowZero`, `text.unplacedSurplus` when an
//   entry carries one, and the counts `text.real(n)` and `text.planned(n)` above zero;
// - `aria-current="date"` on today's gridcell and nowhere else;
// - no-JS fallback: each gridcell holds a real `<a href={linesHref(date)}>`. That link is the
//   server markup carries no `tabindex="-1"`: without JavaScript every link stays focusable, and
//   the client component makes the grid one tab stop once mounted.
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  MonthGrid,
  type MonthGridProps,
  type MonthGridText,
} from "../../../src/app/calendar/month-grid";
import { formatAmount } from "../../../src/domain/money";
import { formatWeekday } from "../../../src/i18n/dates";
import type { CalendarDay, CalendarEntry, CalendarMonth } from "../../../src/ledger/calendar";

const TEXT_EN: MonthGridText = {
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

const TEXT_FR: MonthGridText = {
  label: "novembre 2026",
  today: "Aujourd'hui",
  belowZero: "Sous zéro",
  unplacedSurplus: "Excédent non placé",
  real: (count) => `${count} ${count > 1 ? "réelles" : "réelle"}`,
  planned: (count) => `${count} ${count > 1 ? "prévues" : "prévue"}`,
  name: {
    today: "aujourd'hui",
    balance: "solde de fin de journée",
    noEntries: "aucune écriture",
    belowZero: "sous zéro",
    unplacedSurplus: "excédent non placé",
  },
  legend: "Point : réelle, anneau : prévue",
};

function entry(overrides: Partial<CalendarEntry> = {}): CalendarEntry {
  return {
    id: "t1",
    date: "2026-11-03",
    kind: "real",
    label: "GROCERIES",
    accountId: 1,
    destinationAccountId: null,
    currency: "EUR",
    amount: -4_000,
    status: null,
    categoryId: null,
    categoryName: null,
    settlesOccurrence: false,
    plannedItemId: null,
    nominalDate: null,
    unplacedSurplus: null,
    routingInvalid: false,
    hasOverride: false,
    isLinked: false,
    ...overrides,
  };
}

interface DayContent {
  entries?: CalendarEntry[];
  balance?: number | null;
}

// Every day of November 2026 (a Sunday starts it), with the content of a few of them.
function monthOf(contents: Record<number, DayContent> = {}): CalendarMonth {
  const days: CalendarDay[] = Array.from({ length: 30 }, (_, index) => {
    const { entries = [], balance = 100_000 } = contents[index + 1] ?? {};
    return {
      date: `2026-11-${String(index + 1).padStart(2, "0")}`,
      entries,
      balance,
      isBelowZero: balance !== null && balance < 0,
    };
  });
  return { month: "2026-11", currency: "EUR", days, firstDayBelowZero: null, unconvertedCurrencies: [] };
}

const linesHref = (date: string) => `/calendar/lines?month=2026-11#${date}`;

function render(
  month: CalendarMonth,
  { locale = "en", today = "2026-11-21", text = TEXT_EN }: Partial<MonthGridProps> = {},
): string {
  const props: MonthGridProps = { month, locale, today, linesHref, text };
  return renderToString(createElement(MonthGrid, props));
}

const attributeOf = (tag: string, name: string) => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];
// Intl writes a no-break space between the code and the figure.
const flat = (text: string) => text.replace(/[\s  ]+/g, " ");
const codeAmount = (minor: number, locale: string) =>
  flat(
    new Intl.NumberFormat(locale, { style: "currency", currency: "EUR", currencyDisplay: "code" }).format(
      minor / 100,
    ),
  );

interface Cell {
  tag: string;
  label: string;
  /** From the opening tag of the cell to the next one: its content. */
  content: string;
}

// The days of the month: gridcells that carry a name. The cells outside the month have none.
function cellsOf(html: string): Cell[] {
  const tags = [...html.matchAll(/<[a-z0-9]+\s[^>]*role="gridcell"[^>]*>/g)];
  return tags
    .map((match, index) => ({
      tag: match[0],
      label: attributeOf(match[0], "aria-label") ?? "",
      content: html.slice(match.index, tags[index + 1]?.index ?? html.length),
    }))
    .filter((cell) => cell.label !== "");
}

const cellOf = (html: string, day: number): Cell => {
  const cell = cellsOf(html)[day - 1];
  if (cell === undefined) throw new Error(`no cell for day ${day}`);
  return cell;
};

const headersOf = (html: string) =>
  [...html.matchAll(/<[a-z0-9]+\s[^>]*role="columnheader"[^>]*>([^<]*)/g)].map((match) => ({
    label: attributeOf(match[0], "aria-label"),
    text: match[1]?.trim(),
  }));

const linkOf = (html: string, date: string) =>
  [...html.matchAll(/<a\s[^>]*>/g)].map((match) => match[0]).find((tag) => attributeOf(tag, "href") === linesHref(date));

describe("month grid structure", () => {
  it("is one grid named by the month", () => {
    const html = render(monthOf());

    expect(html.match(/role="grid"/g)).toHaveLength(1);
    const tag = /<[a-z0-9]+\s[^>]*role="grid"[^>]*>/.exec(html)?.[0] ?? "";
    expect(attributeOf(tag, "aria-label")).toBe("November 2026");
  });

  it("heads the seven columns from Sunday in English", () => {
    const headers = headersOf(render(monthOf(), { locale: "en" }));

    expect(headers.map((header) => header.label)).toEqual([
      "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
    ]);
    expect(headers.map((header) => header.text)).toEqual(
      [0, 1, 2, 3, 4, 5, 6].map((weekday) => formatWeekday(weekday, "en", "short")),
    );
  });

  it("heads the seven columns from Monday in French", () => {
    const headers = headersOf(render(monthOf(), { locale: "fr", text: TEXT_FR }));

    expect(headers.map((header) => header.label)).toEqual([
      "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche",
    ]);
    expect(headers.map((header) => header.text)).toEqual(
      [1, 2, 3, 4, 5, 6, 0].map((weekday) => formatWeekday(weekday, "fr", "short")),
    );
  });

  it("has a header row and one row per week", () => {
    // November 2026 spans 5 weeks from Sunday and 6 from Monday.
    expect(render(monthOf(), { locale: "en" }).match(/role="row"/g)).toHaveLength(1 + 5);
    expect(render(monthOf(), { locale: "fr", text: TEXT_FR }).match(/role="row"/g)).toHaveLength(1 + 6);
  });

  it("has one named gridcell per day of the month, in order", () => {
    const cells = cellsOf(render(monthOf()));

    expect(cells).toHaveLength(30);
    expect(cells[0]?.label).toMatch(/^1 November/);
    expect(cells[29]?.label).toMatch(/^30 November/);
  });

  it("leaves the days outside the month empty and out of the tab order", () => {
    const html = render(monthOf(), { locale: "fr", text: TEXT_FR });

    // Monday-first, the grid has six blank cells before 1 Nov: none has a link or a tab stop.
    expect(html.match(/<a\s/g)).toHaveLength(30);
    expect(html).not.toContain("tabindex");
  });
});

describe("month grid cell name", () => {
  it("says the day, the end-of-day balance in currency code and the counts in words", () => {
    const entries = [
      entry({ id: "t1" }),
      entry({ id: "t2" }),
      entry({ id: "p1:2026-11-03", kind: "planned", status: "planned" }),
    ];
    const { label } = cellOf(render(monthOf({ 3: { entries, balance: 123_456 } })), 3);

    expect(label).toContain("3 November");
    expect(flat(label)).toContain(`end-of-day balance ${codeAmount(123_456, "en")}`);
    expect(label).toContain("2 real");
    expect(label).toContain("1 planned");
    expect(label).not.toContain("no entries");
  });

  it("says no entries on a day without any", () => {
    const { label } = cellOf(render(monthOf()), 4);

    expect(label).toContain("no entries");
    expect(label).not.toMatch(/\d+ (real|planned)/);
  });

  it("names a day with only planned entries without a real count", () => {
    const entries = [entry({ id: "p1:2026-11-05", kind: "planned", status: "planned" })];
    const { label } = cellOf(render(monthOf({ 5: { entries } })), 5);

    expect(label).toContain("1 planned");
    expect(label).not.toContain("real");
  });

  it("says today, below zero and the unplaced surplus in the name", () => {
    const entries = [entry({ id: "p1:2026-11-21", kind: "planned", unplacedSurplus: { amount: 10_000, accountId: 2 } })];
    const html = render(monthOf({ 21: { entries, balance: -8_500 } }), { today: "2026-11-21" });
    const { label } = cellOf(html, 21);

    expect(label).toContain("today");
    expect(flat(label)).toContain(`end-of-day balance ${codeAmount(-8_500, "en")}`);
    expect(label).toContain("below zero");
    expect(label).toContain("unplaced surplus");
    expect(cellOf(html, 20).label).not.toMatch(/today|below zero|unplaced surplus/);
  });

  it("writes the name in French with the French words and the Intl figure", () => {
    const entries = [entry({ id: "t1" })];
    const { label } = cellOf(render(monthOf({ 3: { entries, balance: -8_500 } }), { locale: "fr", text: TEXT_FR }), 3);

    expect(label).toContain("3 novembre");
    expect(flat(label)).toContain(`solde de fin de journée ${codeAmount(-8_500, "fr")}`);
    expect(label).toContain("1 réelle");
    expect(label).toContain("sous zéro");
  });
});

describe("month grid cell content", () => {
  it("shows the day number, the balance with its symbol and the counts", () => {
    const entries = [entry({ id: "t1" }), entry({ id: "t2" }), entry({ id: "p1:2026-11-03", kind: "planned" })];
    const { content } = cellOf(render(monthOf({ 3: { entries, balance: 123_456 } })), 3);

    expect(content).toContain(formatAmount(123_456, "EUR", "en"));
    expect(content).toContain("2 real");
    expect(content).toContain("1 planned");
  });

  it("does not draw a count that is zero", () => {
    const { content } = cellOf(render(monthOf({ 3: { entries: [entry()] } })), 3);

    expect(content).toContain("1 real");
    expect(content).not.toContain("planned");
  });

  it("writes Below zero in text on a negative day and on no other", () => {
    const html = render(monthOf({ 9: { balance: -500 } }));

    expect(cellOf(html, 9).content).toContain("Below zero");
    expect(cellOf(html, 10).content).not.toContain("Below zero");
    expect(cellOf(html, 8).content).not.toContain("Below zero");
  });

  it("states an unplaced surplus in text", () => {
    const entries = [entry({ id: "p1:2026-11-12", kind: "planned", unplacedSurplus: { amount: 10_000, accountId: 2 } })];
    const html = render(monthOf({ 12: { entries } }));

    expect(cellOf(html, 12).content).toContain("Unplaced surplus");
    expect(cellOf(html, 13).content).not.toContain("Unplaced surplus");
  });

  it("writes the word Today on today's cell only", () => {
    const html = render(monthOf(), { today: "2026-11-21" });

    expect(cellOf(html, 21).content).toContain(">Today<");
    expect(cellOf(html, 22).content).not.toContain(">Today<");
  });
});

describe("month grid today", () => {
  it("marks today with aria-current=date and no other day", () => {
    const html = render(monthOf(), { today: "2026-11-21" });

    expect(html.match(/aria-current="date"/g)).toHaveLength(1);
    expect(attributeOf(cellOf(html, 21).tag, "aria-current")).toBe("date");
  });

  it("marks no day when today is in another month", () => {
    expect(render(monthOf(), { today: "2026-12-02" })).not.toContain("aria-current");
  });
});

describe("month grid without JavaScript", () => {
  it("keeps every day link naturally focusable, with no tabindex of -1", () => {
    for (const today of ["2026-11-21", "2026-12-02"]) {
      const html = render(monthOf(), { today });

      expect(html).not.toContain('tabindex="-1"');
      for (let day = 1; day <= 30; day += 1) {
        const date = `2026-11-${String(day).padStart(2, "0")}`;
        expect(attributeOf(linkOf(html, date) ?? "", "tabindex")).toBeUndefined();
      }
    }
  });

  it("links every day to the line view of its month", () => {
    const html = render(monthOf());

    for (let day = 1; day <= 30; day += 1) {
      const date = `2026-11-${String(day).padStart(2, "0")}`;
      const link = cellOf(html, day).content.match(/<a\s[^>]*>/)?.[0] ?? "";
      expect(attributeOf(link, "href")).toBe(linesHref(date));
    }
  });
});
