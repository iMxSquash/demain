import { describe, expect, it } from "vitest";

import {
  buildLineChartGeometry,
  type LineChartGeometryInput,
} from "../../src/charts/line-chart-geometry";

// The plot area is 300 wide (x from 50 to 350) and 160 tall (y from 10 to 170).
const FRAME = {
  width: 400,
  height: 200,
  margin: { top: 10, right: 50, bottom: 30, left: 50 },
};

function input(
  overrides: Partial<LineChartGeometryInput> = {},
): LineChartGeometryInput {
  return {
    ...FRAME,
    categoryCount: 3,
    series: [{ id: "checking", values: [0, 100, 200] }],
    maxXTicks: 12,
    ...overrides,
  };
}

describe("buildLineChartGeometry", () => {
  it("spreads the categories evenly inside the plot, away from its edges", () => {
    const { xs } = buildLineChartGeometry(input());

    expect(xs).toEqual([100, 200, 300]);
  });

  it("draws a higher value higher on the chart, from zero at the bottom", () => {
    const { series } = buildLineChartGeometry(input());

    expect(series[0]?.points.map((point) => point.y)).toEqual([170, 90, 10]);
  });

  it("joins the points of a series with straight segments", () => {
    const { series } = buildLineChartGeometry(input());

    expect(series[0]?.path).toBe("M100,170L200,90L300,10");
  });

  it("draws a single point without a segment", () => {
    const { xs, series } = buildLineChartGeometry(
      input({ categoryCount: 1, series: [{ id: "checking", values: [50] }] }),
    );

    expect(xs).toEqual([200]);
    expect(series[0]?.points).toHaveLength(1);
    expect(series[0]?.path).not.toContain("L");
  });

  it("keeps zero on the axis when every value is positive, with a tick on it", () => {
    const { yTicks } = buildLineChartGeometry(
      input({ series: [{ id: "checking", values: [120, 150, 180] }] }),
    );

    expect(yTicks.find((tick) => tick.value === 0)?.y).toBe(170);
    expect(yTicks.map((tick) => tick.value)).toEqual([0, 50, 100, 150, 200]);
  });

  it("makes room below zero for negative values and marks the zero line", () => {
    const { yTicks, series } = buildLineChartGeometry(
      input({ series: [{ id: "checking", values: [-100, 0, 100] }] }),
    );

    expect(series[0]?.points.map((point) => point.y)).toEqual([170, 90, 10]);
    expect(yTicks.find((tick) => tick.value === 0)?.y).toBe(90);
  });

  it("scales all the series on the same axis", () => {
    const { series } = buildLineChartGeometry(
      input({
        series: [
          { id: "checking", values: [0, 0, 0] },
          { id: "savings", values: [200, 200, 200] },
        ],
      }),
    );

    expect(series.map((entry) => entry.points[0]?.y)).toEqual([170, 10]);
  });

  it("gives a flat chart of zeros a usable axis", () => {
    const { yTicks, series } = buildLineChartGeometry(
      input({ series: [{ id: "checking", values: [0, 0, 0] }] }),
    );

    expect(yTicks.length).toBeGreaterThan(1);
    expect(series[0]?.points.map((point) => point.y)).toEqual([170, 170, 170]);
  });

  it("labels at most the requested number of categories, evenly and starting with the first", () => {
    const { xTickIndexes } = buildLineChartGeometry(
      input({
        categoryCount: 36,
        series: [{ id: "checking", values: Array.from({ length: 36 }, () => 1) }],
        maxXTicks: 12,
      }),
    );

    expect(xTickIndexes).toEqual([0, 3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33]);
  });

  it("labels every category when there are few of them", () => {
    const { xTickIndexes } = buildLineChartGeometry(input());

    expect(xTickIndexes).toEqual([0, 1, 2]);
  });

  it("returns nothing to draw without a category", () => {
    const geometry = buildLineChartGeometry(
      input({ categoryCount: 0, series: [{ id: "checking", values: [] }] }),
    );

    expect(geometry.xs).toEqual([]);
    expect(geometry.xTickIndexes).toEqual([]);
    expect(geometry.series[0]?.path).toBe("");
  });
});
