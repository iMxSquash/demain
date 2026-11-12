/**
 * Geometry of the trajectory chart: month-end balances, real up to today and
 * planned after it. Scales and paths come from `d3-scale` and `d3-shape`; there
 * is no rendering, so the layout is tested without a DOM. See ADR-012 and
 * DOMAIN, "The real chart".
 */

import { scaleLinear } from "d3-scale";
import { line } from "d3-shape";

import type { ChartMargin, ChartPoint } from "../../../src/charts/line-chart-geometry";

/** Where a month stands against today. */
export type MonthKind = "real" | "today" | "planned";

export type LabelAnchor = "start" | "middle" | "end";

export interface TrajectoryGeometryInput {
  /** Real pixel width of the plot, so text keeps its size at every width. */
  width: number;
  height: number;
  margin: ChartMargin;
  categoryCount: number;
  /** Index of the current month: real up to it, planned after it. */
  todayIndex: number;
  /** One month-end value per category, in minor units. */
  series: readonly { id: string; values: readonly number[] }[];
  /** Room a month label needs, its own width plus the space around it. */
  minLabelGap: number;
  /** Half the width of the Today pill, which no month label may touch. */
  todayLabelHalfWidth: number;
}

export interface TrajectoryPoint extends ChartPoint {
  kind: MonthKind;
}

export interface TrajectorySeriesGeometry {
  id: string;
  points: TrajectoryPoint[];
  realPath: string;
  plannedPath: string;
}

export interface TrajectoryGeometry {
  xs: number[];
  /** Distance between two months. */
  step: number;
  /** Month labels under the axis, anchored so that they stay inside the plot. */
  xTicks: { index: number; x: number; anchor: LabelAnchor }[];
  yTicks: { value: number; y: number }[];
  plot: { left: number; right: number; top: number; bottom: number };
  series: TrajectorySeriesGeometry[];
}

// The first and last points sit this far inside the plot, so a marker is never
// cut by its edge.
const INNER_PADDING = 8;
const Y_TICK_TARGET = 4;
// Domain of an axis with nothing but zeros, so that it still has a scale.
const FLAT_AXIS_MAX = 1;
const COORDINATE_DIGITS = 2;

function roundCoordinate(value: number): number {
  const factor = 10 ** COORDINATE_DIGITS;
  return Math.round(value * factor) / factor;
}

// Zero is always on the axis: a balance read from another baseline misleads,
// and how far a balance stays from zero is what a budget is checked for.
function valueExtent(values: readonly number[]): [number, number] {
  const low = Math.min(0, ...values);
  const high = Math.max(0, ...values);
  return low === high ? [0, FLAT_AXIS_MAX] : [low, high];
}

export function monthKind(index: number, todayIndex: number): MonthKind {
  if (index < todayIndex) return "real";
  return index === todayIndex ? "today" : "planned";
}

interface Span {
  from: number;
  to: number;
}

function overlaps(a: Span, b: Span): boolean {
  return a.from < b.to && b.from < a.to;
}

// The last month of the horizon is labeled first, then the first month, then
// months counted from today outwards at a steady rhythm. A label is kept only
// if the span it really covers, once anchored, clears the Today pill and the
// labels already placed. The first and last labels align on the plot edges.
function placeMonthLabels(
  input: TrajectoryGeometryInput,
  xs: readonly number[],
  step: number,
  plot: TrajectoryGeometry["plot"],
): TrajectoryGeometry["xTicks"] {
  const { categoryCount, todayIndex, minLabelGap } = input;
  const lastIndex = categoryCount - 1;
  const todayX = xs[todayIndex] ?? plot.left;
  const pill = { from: todayX - input.todayLabelHalfWidth, to: todayX + input.todayLabelHalfWidth };
  const every = Math.max(1, Math.ceil(minLabelGap / step));
  const rhythm = xs.map((_, index) => index).filter((index) => Math.abs(index - todayIndex) % every === 0);

  const placed: { index: number; x: number; anchor: LabelAnchor; span: Span }[] = [];
  for (const index of [lastIndex, 0, ...rhythm]) {
    if (index === todayIndex || placed.some((label) => label.index === index)) continue;
    const anchor: LabelAnchor = index === 0 ? "start" : index === lastIndex ? "end" : "middle";
    const x = anchor === "start" ? plot.left : anchor === "end" ? plot.right : (xs[index] ?? plot.left);
    const from = anchor === "start" ? x : anchor === "end" ? x - minLabelGap : x - minLabelGap / 2;
    const span = { from, to: from + minLabelGap };
    if (overlaps(span, pill) || placed.some((label) => overlaps(span, label.span))) continue;
    placed.push({ index, x, anchor, span });
  }
  return placed
    .sort((a, b) => a.index - b.index)
    .map(({ index, x, anchor }) => ({ index, x, anchor }));
}

export function buildTrajectoryGeometry(input: TrajectoryGeometryInput): TrajectoryGeometry {
  const { width, height, margin, categoryCount, todayIndex } = input;
  const plot = {
    left: margin.left,
    right: width - margin.right,
    top: margin.top,
    bottom: height - margin.bottom,
  };
  const first = plot.left + INNER_PADDING;
  const last = plot.right - INNER_PADDING;
  const step = categoryCount > 1 ? (last - first) / (categoryCount - 1) : 0;
  const xs = Array.from({ length: categoryCount }, (_, index) =>
    roundCoordinate(categoryCount > 1 ? first + index * step : (first + last) / 2),
  );

  const yScale = scaleLinear()
    .domain(valueExtent(input.series.flatMap((entry) => entry.values)))
    .nice(Y_TICK_TARGET)
    .range([plot.bottom, plot.top]);
  const toY = (value: number) => roundCoordinate(yScale(value));
  const toPath = line<ChartPoint>()
    .x((point) => point.x)
    .y((point) => point.y);

  return {
    xs,
    step: roundCoordinate(step),
    xTicks: placeMonthLabels(input, xs, step, plot),
    // Amounts are integers in minor units: a fractional tick has no meaning.
    yTicks: yScale
      .ticks(Y_TICK_TARGET)
      .filter(Number.isInteger)
      .map((value) => ({ value, y: toY(value) })),
    plot,
    series: input.series.map((entry) => {
      const points = entry.values.map((value, index) => ({
        x: xs[index] ?? first,
        y: toY(value),
        kind: monthKind(index, todayIndex),
      }));
      return {
        id: entry.id,
        points,
        realPath: toPath(points.slice(0, todayIndex + 1)) ?? "",
        // The planned part starts on today, so the two parts join.
        plannedPath: todayIndex < points.length - 1 ? (toPath(points.slice(todayIndex)) ?? "") : "",
      };
    }),
  };
}

/** The month nearest to a horizontal position in the plot, for the pointer. */
export function monthAt(geometry: TrajectoryGeometry, x: number): number {
  const lastIndex = geometry.xs.length - 1;
  if (geometry.step === 0) return 0;
  const index = Math.round((x - (geometry.xs[0] ?? 0)) / geometry.step);
  return Math.min(Math.max(index, 0), lastIndex);
}
