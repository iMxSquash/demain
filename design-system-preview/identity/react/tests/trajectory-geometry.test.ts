import { describe, expect, it } from "vitest";

import {
  buildTrajectoryGeometry,
  monthAt,
  monthKind,
  type TrajectoryGeometryInput,
} from "../trajectory-geometry";

// The plot area is 400 wide (x from 50 to 450) and 200 tall (y from 20 to 220).
const FRAME = {
  width: 460,
  height: 250,
  margin: { top: 20, right: 10, bottom: 30, left: 50 },
};

function input(
  overrides: Partial<TrajectoryGeometryInput> = {},
): TrajectoryGeometryInput {
  return {
    ...FRAME,
    categoryCount: 5,
    todayIndex: 2,
    series: [{ id: "checking", values: [100, 200, 300, 250, 400] }],
    minLabelGap: 40,
    todayLabelHalfWidth: 0,
    ...overrides,
  };
}

describe("buildTrajectoryGeometry", () => {
  it("spreads the months over the plot, the first and last on its inner edges", () => {
    const { xs } = buildTrajectoryGeometry(input());

    expect(xs).toEqual([58, 154, 250, 346, 442]);
  });

  it("keeps zero on the axis, since a balance read from another baseline misleads", () => {
    const { yTicks } = buildTrajectoryGeometry(input());

    expect(yTicks[0]?.value).toBe(0);
    expect(yTicks[0]?.y).toBe(220);
  });

  it("goes below zero when a balance does", () => {
    const { yTicks } = buildTrajectoryGeometry(
      input({ series: [{ id: "checking", values: [100, -150, 300, 250, 400] }] }),
    );

    expect(yTicks.some((tick) => tick.value < 0)).toBe(true);
  });

  it("only labels the vertical axis with whole minor units", () => {
    const { yTicks } = buildTrajectoryGeometry(
      input({ series: [{ id: "checking", values: [0, 1, 2, 3, 3] }] }),
    );

    expect(yTicks.every((tick) => Number.isInteger(tick.value))).toBe(true);
  });

  it("marks each month as real, today or planned", () => {
    const { series } = buildTrajectoryGeometry(input());

    expect(series[0]?.points.map((point) => point.kind)).toEqual([
      "real",
      "real",
      "today",
      "planned",
      "planned",
    ]);
  });

  it("joins the real and planned paths on today", () => {
    const { series } = buildTrajectoryGeometry(input());
    const today = series[0]?.points[2];

    expect(series[0]?.realPath.endsWith(`${today?.x},${today?.y}`)).toBe(true);
    expect(series[0]?.plannedPath.startsWith(`M${today?.x},${today?.y}`)).toBe(true);
  });

  it("has no planned path when today is the last month shown", () => {
    const { series } = buildTrajectoryGeometry(input({ todayIndex: 4 }));

    expect(series[0]?.plannedPath).toBe("");
  });

  it("labels months far enough apart to be read, counting from today", () => {
    const { xTicks } = buildTrajectoryGeometry(
      input({
        categoryCount: 9,
        todayIndex: 4,
        minLabelGap: 60,
        series: [{ id: "checking", values: [1, 2, 3, 4, 5, 6, 7, 8, 9] }],
      }),
    );

    expect(xTicks.map((tick) => tick.index)).toEqual([0, 2, 6, 8]);
  });

  it("aligns the first and last labels on the plot edges", () => {
    const { xTicks } = buildTrajectoryGeometry(input());

    expect(xTicks[0]).toEqual({ index: 0, x: 50, anchor: "start" });
    expect(xTicks.at(-1)).toEqual({ index: 4, x: 450, anchor: "end" });
  });

  it("never labels today or a month under the Today pill", () => {
    const { xTicks } = buildTrajectoryGeometry(input({ todayLabelHalfWidth: 100 }));

    expect(xTicks.map((tick) => tick.index)).toEqual([0, 4]);
  });

  it("keeps the last month of the horizon labeled when space is short", () => {
    const { xTicks } = buildTrajectoryGeometry(
      input({
        width: 295,
        margin: { top: 20, right: 8, bottom: 30, left: 52 },
        categoryCount: 18,
        todayIndex: 5,
        minLabelGap: 52,
        todayLabelHalfWidth: 40,
        series: [{ id: "checking", values: Array.from({ length: 18 }, (_, index) => index) }],
      }),
    );

    expect(xTicks.map((tick) => tick.index)).toEqual([17]);
  });

  it("puts every series on the same vertical scale", () => {
    const { series } = buildTrajectoryGeometry(
      input({
        series: [
          { id: "checking", values: [100, 100, 100, 100, 100] },
          { id: "savings", values: [400, 400, 400, 400, 400] },
        ],
      }),
    );

    expect(series[0]?.points[0]?.y).toBeGreaterThan(series[1]?.points[0]?.y ?? 0);
  });
});

describe("monthKind", () => {
  it("tells the months before, at and after today apart", () => {
    expect([0, 2, 3].map((index) => monthKind(index, 2))).toEqual(["real", "today", "planned"]);
  });
});

describe("monthAt", () => {
  it("finds the month nearest to a position, within the months shown", () => {
    const geometry = buildTrajectoryGeometry(input());

    expect(monthAt(geometry, 150)).toBe(1);
    expect(monthAt(geometry, 0)).toBe(0);
    expect(monthAt(geometry, 1000)).toBe(4);
  });
});
