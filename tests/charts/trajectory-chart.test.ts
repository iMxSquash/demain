import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { TrajectoryChart, type TrajectoryChartProps } from "../../src/charts/trajectory-chart";
import { RealChartView, type RealChartViewProps } from "../../src/app/real-chart-view";
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

describe("RealChartView on the server", () => {
  const VIEW_TEXT = {
    ...TABLE_TEXT,
    horizonLegend: "Horizon",
    horizonOptions: { 3: "3 months", 6: "6 months", 12: "12 months" },
  };
  const REAL_KEYS = ["2025-11", "2025-12", "2026-01", "2026-02", "2026-03"];
  const PLANNED_KEYS = [
    "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09",
    "2026-10", "2026-11", "2026-12", "2027-01", "2027-02", "2027-03",
  ];
  // The checking series dips lower in the real past than anywhere planned, and its
  // planned minimum moves from the 2nd planned month to the 9th as the horizon grows.
  const CHECKING_REAL = [200_000, -900_000, 200_000, 200_000, 200_000];
  const CHECKING_PLANNED = [
    300_000, 150_000, 400_000, 350_000, 360_000, 370_000, 380_000, 50_000, 390_000, 400_000, 410_000, 420_000,
  ];
  const labelOf = (value: number) => (value === -900_000 ? "REAL-LOW" : `V${value}`);

  function monthOf(key: string) {
    return { key, label: `label-${key}`, tickLabel: `tick-${key}` };
  }

  function viewProps(plannedCount: number, overrides: Partial<RealChartViewProps> = {}): RealChartViewProps {
    const keys = [...REAL_KEYS, ...PLANNED_KEYS.slice(0, plannedCount)];
    const checking = [...CHECKING_REAL, ...CHECKING_PLANNED.slice(0, plannedCount)];
    return {
      label: "Month-end balances",
      hint: "Use the arrow keys.",
      currency: "EUR",
      locale: "en",
      months: keys.map(monthOf),
      todayIndex: REAL_KEYS.length - 1,
      series: [
        { id: "checking", label: "Checking", tone: "primary", values: checking, valueLabels: checking.map(labelOf) },
        {
          id: "savings",
          label: "Savings",
          tone: "secondary",
          values: keys.map(() => 500_000),
          valueLabels: keys.map(() => "S500000"),
        },
      ],
      text: VIEW_TEXT,
      ...overrides,
    };
  }

  const renderView = (plannedCount: number, overrides: Partial<RealChartViewProps> = {}) =>
    renderToString(createElement(RealChartView, viewProps(plannedCount, overrides)));

  const occurrences = (markup: string, needle: string) => markup.split(needle).length - 1;
  const plannedRows = (markup: string) => occurrences(markup, ">Planned, dated</td>");
  const radios = (markup: string) => markup.match(/<input[^>]*type="radio"[^>]*>/g) ?? [];

  it("continues the real line with the dated planned months", () => {
    const markup = renderView(4);

    expect(markup).toContain("data-planned");
    expect(plannedRows(markup)).toBe(4);
    expect(markup).toContain(">Real, today</td>");
  });

  it("offers a horizon of 3, 6 or 12 months as native radios in a fieldset with a legend", () => {
    const markup = renderView(12);

    expect(markup).toContain("<fieldset");
    expect(markup).toMatch(/<legend[^>]*>Horizon<\/legend>/);
    const inputs = radios(markup);
    expect(inputs).toHaveLength(3);
    expect(inputs.map((input) => input.match(/value="(\d+)"/)?.[1])).toEqual(["3", "6", "12"]);
    expect(markup).toContain("3 months");
    expect(markup).toContain("6 months");
    expect(markup).toContain("12 months");
  });

  it("starts on 6 months by default and on the given horizon otherwise", () => {
    const checkedValue = (markup: string) =>
      radios(markup)
        .filter((input) => /\bchecked\b/.test(input))
        .map((input) => input.match(/value="(\d+)"/)?.[1]);

    expect(checkedValue(renderView(12))).toEqual(["6"]);
    expect(checkedValue(renderView(12, { defaultHorizon: 3 }))).toEqual(["3"]);
    expect(checkedValue(renderView(12, { defaultHorizon: 12 }))).toEqual(["12"]);
  });

  it("shows 3 planned months in the table and in the chart for a horizon of 3", () => {
    const markup = renderView(12, { defaultHorizon: 3 });

    expect(plannedRows(markup)).toBe(3);
    // The last month always carries an axis label: it is the 3rd planned month, not the 12th.
    expect(markup).toContain("tick-2026-06");
    expect(markup).not.toContain("tick-2026-07");
    expect(markup).not.toContain("tick-2027-03");
    expect(markup).toContain("label-2026-06");
    expect(markup).not.toContain("label-2026-07");
  });

  it("shows all 12 planned months for a horizon of 12", () => {
    const markup = renderView(12, { defaultHorizon: 12 });

    expect(plannedRows(markup)).toBe(12);
    expect(markup).toContain("tick-2027-03");
  });

  it("keeps every planned month when fewer than the horizon are available", () => {
    const markup = renderView(2);

    expect(plannedRows(markup)).toBe(2);
    expect(radios(markup)).toHaveLength(3);
  });

  it("labels the lowest planned checking balance once in the chart and once in the table", () => {
    const markup = renderView(12, { defaultHorizon: 3 });

    // Planned minimum within 3 months is the 2nd planned month; the real dip is ignored.
    expect(occurrences(markup, "V150000")).toBe(2);
    expect(occurrences(markup, "REAL-LOW")).toBe(1);
    expect(markup).not.toContain("V50000");
  });

  it("moves the lowest label to the lowest month of the chosen horizon", () => {
    const markup = renderView(12, { defaultHorizon: 12 });

    expect(occurrences(markup, "V50000")).toBe(2);
    expect(occurrences(markup, "V150000")).toBe(1);
  });

  it("renders no control and no planned part when no month is planned", () => {
    const markup = renderView(0);

    expect(markup).not.toContain("<fieldset");
    expect(radios(markup)).toHaveLength(0);
    expect(markup).not.toContain("data-planned");
    expect(markup).not.toContain("Planned ahead");
    expect(plannedRows(markup)).toBe(0);
    expect(markup).toContain("label-2026-03");
  });
});
