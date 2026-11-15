import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { TrajectoryChart, type TrajectoryChartProps } from "../../src/charts/trajectory-chart";
import { TrajectoryTable } from "../../src/charts/trajectory-table";

const TEXT = {
  real: "Real",
  realToday: "Real, today",
  planned: "Planned, dated",
  upToToday: "Up to today",
  plannedAhead: "Planned ahead",
  today: "Today",
};
const TABLE_TEXT = { ...TEXT, caption: "Month-end totals", month: "Month", kind: "Kind" };

const MONTHS = [
  { key: "2026-08", label: "August 2026", tickLabel: "Aug 26" },
  { key: "2026-09", label: "September 2026", tickLabel: "Sep 26" },
  { key: "2026-10", label: "October 2026", tickLabel: "Oct 26" },
  { key: "2026-11", label: "November 2026", tickLabel: "Nov 26" },
];
const SERIES: TrajectoryChartProps["series"] = [
  {
    id: "checking",
    label: "Checking",
    tone: "primary",
    values: [10_000, 20_000, 15_000, 30_000],
    valueLabels: ["€100.00", "€200.00", "€150.00", "€300.00"],
  },
  {
    id: "savings",
    label: "Savings",
    tone: "secondary",
    values: [50_000, 50_000, 60_000, 60_000],
    valueLabels: ["€500.00", "€500.00", "€600.00", "€600.00"],
  },
];

function props(overrides: Partial<TrajectoryChartProps> = {}): TrajectoryChartProps {
  return {
    label: "Month-end balances",
    hint: "Use the arrow keys.",
    currency: "EUR",
    locale: "en",
    months: MONTHS,
    todayIndex: MONTHS.length - 1,
    series: SERIES,
    text: TEXT,
    ...overrides,
  };
}

const render = (overrides: Partial<TrajectoryChartProps> = {}) =>
  renderToString(createElement(TrajectoryChart, props(overrides)));

describe("TrajectoryChart on the server", () => {
  it("is one named tab stop, described by its hint, with a polite live region", () => {
    const markup = render();

    expect(markup).toMatch(/role="group"[^>]*aria-label="Month-end balances"|aria-label="Month-end balances"[^>]*role="group"/);
    expect(markup).toMatch(/tabindex="0"/);
    const hintId = markup.match(/aria-describedby="([^"]+)"/)?.[1];
    expect(markup).toContain(`id="${hintId}"`);
    expect(markup).toContain('aria-live="polite"');
  });

  it("keeps the drawing out of the accessibility tree and names each line", () => {
    const markup = render();

    expect(markup).toMatch(/<svg[^>]*aria-hidden="true"/);
    expect(markup).toContain(">Checking<");
    expect(markup).toContain(">Savings<");
  });

  it("shows no planned part when no month is planned", () => {
    const markup = render();

    expect(markup).not.toContain("Planned ahead");
    expect(markup).not.toContain("Up to today");
    expect(markup).not.toContain("Planned, dated");
    expect(markup).not.toContain("data-planned");
    expect(markup).toContain(">Today<");
  });

  it("shows the planned zone, its labels and its legend entry once a month is planned", () => {
    const markup = render({ todayIndex: 1 });

    expect(markup).toContain("Planned ahead");
    expect(markup).toContain("Up to today");
    expect(markup).toContain("Planned, dated");
    expect(markup).toContain("data-planned");
  });

  it("leaves out the lowest label when nothing is planned", () => {
    const markup = render({ lowest: { seriesId: "checking", index: 3, label: "Lowest €150.00" } });

    expect(markup).not.toContain("Lowest €150.00");
  });
});

describe("TrajectoryTable on the server", () => {
  const markup = renderToString(
    createElement(TrajectoryTable, { months: MONTHS, todayIndex: 2, series: SERIES, text: TABLE_TEXT }),
  );

  it("has one row per month the chart draws, each month as a time element", () => {
    expect(markup.match(/<time dateTime="/g)).toHaveLength(MONTHS.length);
    expect(markup).toContain('<time dateTime="2026-11">November 2026</time>');
  });

  it("gives every series a column and its values as the reader sees them", () => {
    expect(markup).toContain(">Checking</th>");
    expect(markup).toContain("€300.00");
    expect(markup).toContain("€600.00");
  });

  it("tells the real, today and planned months apart in words", () => {
    expect(markup).toContain(">Real</td>");
    expect(markup).toContain(">Real, today</td>");
    expect(markup).toContain(">Planned, dated</td>");
  });
});
