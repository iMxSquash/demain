import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  LineChart,
  type LineChartProps,
} from "../../src/charts/line-chart";

const PROPS: LineChartProps = {
  label: "Month-end balances",
  hint: "Use the left and right arrow keys to read a month.",
  currency: "EUR",
  locale: "en",
  categories: [
    { key: "2026-01", label: "January 2026", tickLabel: "Jan 26" },
    { key: "2026-02", label: "February 2026", tickLabel: "Feb 26" },
    { key: "2026-03", label: "March 2026", tickLabel: "Mar 26" },
  ],
  series: [
    {
      id: "checking",
      label: "Checking",
      marker: "circle",
      tone: "blue",
      values: [10_000, 20_000, 30_000],
      valueLabels: ["€100.00", "€200.00", "€300.00"],
    },
    {
      id: "savings",
      label: "Savings",
      marker: "square",
      tone: "orange",
      values: [50_000, 50_000, 60_000],
      valueLabels: ["€500.00", "€500.00", "€600.00"],
    },
  ],
};

function render(overrides: Partial<LineChartProps> = {}): string {
  return renderToStaticMarkup(createElement(LineChart, { ...PROPS, ...overrides }));
}

function markersOf(markup: string, seriesId: string, tag: string): number {
  return markup.match(new RegExp(`<${tag}[^>]*data-series="${seriesId}"`, "g"))?.length ?? 0;
}

describe("LineChart", () => {
  it("is one named tab stop that explains how to read it with the keyboard", () => {
    const markup = render();

    expect(markup).toMatch(/<div[^>]*role="group"[^>]*aria-label="Month-end balances"/);
    expect(markup).toMatch(/<div[^>]*tabindex="0"/);
    const hintId = markup.match(/aria-describedby="([^"]+)"/)?.[1];
    expect(markup).toContain(`id="${hintId}"`);
    expect(markup).toContain("Use the left and right arrow keys to read a month.");
  });

  it("keeps the drawing out of the accessibility tree: the table and the readout carry the data", () => {
    expect(render()).toMatch(/<svg[^>]*aria-hidden="true"[^>]*viewBox/);
  });

  it("draws a circle per month for one series and a square per month for the other", () => {
    const markup = render();

    expect(markersOf(markup, "checking", "circle")).toBe(3);
    expect(markersOf(markup, "savings", "rect")).toBe(3);
  });

  it("names each series in a legend with the same marker as the chart", () => {
    const legend = render().match(/<ul[^>]*>.*?<\/ul>/)?.[0] ?? "";

    expect(legend).toContain("Checking");
    expect(legend).toContain("Savings");
    expect(legend).toContain("<circle");
    expect(legend).toContain("<rect");
  });

  it("labels the months and the amounts on the axes", () => {
    const markup = render();

    expect(markup).toContain(">Jan 26<");
    expect(markup).toContain(">Mar 26<");
    expect(markup).toContain(">€0.00<");
    expect(markup).toContain(">€600.00<");
  });

  it("has an empty live region ready to read out a month", () => {
    expect(render()).toMatch(/<p[^>]*aria-live="polite"[^>]*><\/p>/);
  });

  it("draws one line per series", () => {
    const paths = render().match(/<path[^>]*data-series=/g) ?? [];

    expect(paths).toHaveLength(2);
  });
});
