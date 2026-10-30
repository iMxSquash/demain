/**
 * Geometry of a line chart: scales and paths from `d3-scale` and `d3-shape`,
 * with no rendering. Pure functions, so the layout is tested without a DOM.
 * See ADR-012.
 */

import { scaleLinear, scalePoint } from "d3-scale";
import { line } from "d3-shape";

export interface ChartMargin {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface LineChartGeometryInput {
  width: number;
  height: number;
  margin: ChartMargin;
  categoryCount: number;
  /** One value per category, in the unit of the axis. */
  series: readonly { id: string; values: readonly number[] }[];
  /** Upper bound of the labeled categories on the horizontal axis. */
  maxXTicks: number;
}

export interface ChartPoint {
  x: number;
  y: number;
}

export interface LineChartGeometry {
  /** Horizontal position of each category. */
  xs: number[];
  /** Indexes of the categories that carry a label on the horizontal axis. */
  xTickIndexes: number[];
  yTicks: { value: number; y: number }[];
  series: { id: string; points: ChartPoint[]; path: string }[];
}

// Points sit half a step away from the edges of the plot, so that a marker is
// never cut by the axis.
const POINT_PADDING = 0.5;
const Y_TICK_TARGET = 5;
// Domain of an axis with nothing but zeros, so that it still has a scale.
const FLAT_AXIS_MAX = 1;
const COORDINATE_DIGITS = 2;

function roundCoordinate(value: number): number {
  const factor = 10 ** COORDINATE_DIGITS;
  return Math.round(value * factor) / factor;
}

// Zero is always on the axis: a balance chart read from another baseline
// misleads.
function valueExtent(values: readonly number[]): [number, number] {
  const low = Math.min(0, ...values);
  const high = Math.max(0, ...values);
  return low === high ? [0, FLAT_AXIS_MAX] : [low, high];
}

function labeledCategories(indexes: readonly number[], maxXTicks: number): number[] {
  const step = Math.max(1, Math.ceil(indexes.length / maxXTicks));
  return indexes.filter((index) => index % step === 0);
}

export function buildLineChartGeometry(
  input: LineChartGeometryInput,
): LineChartGeometry {
  const { width, height, margin } = input;
  const indexes = Array.from({ length: input.categoryCount }, (_, index) => index);
  const xScale = scalePoint<number>()
    .domain(indexes)
    .range([margin.left, width - margin.right])
    .padding(POINT_PADDING);
  const yScale = scaleLinear()
    .domain(valueExtent(input.series.flatMap((entry) => entry.values)))
    .nice(Y_TICK_TARGET)
    .range([height - margin.bottom, margin.top]);
  const toY = (value: number) => roundCoordinate(yScale(value));

  const xs = indexes.map((index) => roundCoordinate(xScale(index) ?? margin.left));
  const toPath = line<ChartPoint>()
    .x((point) => point.x)
    .y((point) => point.y);

  return {
    xs,
    xTickIndexes: labeledCategories(indexes, input.maxXTicks),
    // Amounts are integers in minor units: a fractional tick has no meaning.
    yTicks: yScale
      .ticks(Y_TICK_TARGET)
      .filter(Number.isInteger)
      .map((value) => ({ value, y: toY(value) })),
    series: input.series.map((entry) => {
      const points = entry.values.map((value, index) => ({
        x: xs[index] ?? margin.left,
        y: toY(value),
      }));
      return { id: entry.id, points, path: toPath(points) ?? "" };
    }),
  };
}
