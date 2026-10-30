"use client";

import { useId, useState, type KeyboardEvent } from "react";

import { formatAmount } from "../domain/money";
import { moveCursor } from "./cursor";
import { buildLineChartGeometry } from "./line-chart-geometry";

export type ChartMarker = "circle" | "square";
export type ChartTone = "blue" | "orange";

export interface LineChartCategory {
  key: string;
  /** Full name, read out when the cursor stops on the category. */
  label: string;
  /** Short name written under the horizontal axis. */
  tickLabel: string;
}

export interface LineChartSeries {
  id: string;
  label: string;
  /** Series are told apart by this shape as well as by `tone`. */
  marker: ChartMarker;
  tone: ChartTone;
  /** Minor units, one per category. */
  values: number[];
  /** The values as the reader sees them, one per category. */
  valueLabels: string[];
}

export interface LineChartProps {
  /** Accessible name of the chart. */
  label: string;
  /** How to read the chart with the keyboard. */
  hint: string;
  /** Currency of the values, for the vertical axis. */
  currency: string;
  locale: string;
  categories: LineChartCategory[];
  series: LineChartSeries[];
}

const WIDTH = 720;
const HEIGHT = 340;
const MARGIN = { top: 16, right: 24, bottom: 36, left: 100 };
const MAX_X_TICKS = 12;
const AXIS_LABEL_OFFSET = 8;
const X_LABEL_OFFSET = 22;
const LINE_WIDTH = 2.5;
const MARKER_SIZE = 9;
const ACTIVE_MARKER_SIZE = 13;
const LEGEND_MARKER_SIZE = 12;

// Literal class names: Tailwind only generates what it can read in the source.
const TONE_CLASSES: Record<ChartTone, { stroke: string; fill: string }> = {
  blue: { stroke: "stroke-blue-700", fill: "fill-blue-700" },
  orange: { stroke: "stroke-orange-700", fill: "fill-orange-700" },
};

interface MarkerProps {
  kind: ChartMarker;
  x: number;
  y: number;
  size: number;
  tone: ChartTone;
  seriesId?: string;
}

function Marker({ kind, x, y, size, tone, seriesId }: MarkerProps) {
  const className = `${TONE_CLASSES[tone].fill} stroke-white`;
  return kind === "circle" ? (
    <circle
      cx={x}
      cy={y}
      r={size / 2}
      className={className}
      data-series={seriesId}
    />
  ) : (
    <rect
      x={x - size / 2}
      y={y - size / 2}
      width={size}
      height={size}
      className={className}
      data-series={seriesId}
    />
  );
}

export function LineChart({
  label,
  hint,
  currency,
  locale,
  categories,
  series,
}: LineChartProps) {
  const hintId = useId();
  const [cursor, setCursor] = useState<number | null>(null);
  const lastIndex = categories.length - 1;
  const geometry = buildLineChartGeometry({
    width: WIDTH,
    height: HEIGHT,
    margin: MARGIN,
    categoryCount: categories.length,
    series,
    maxXTicks: MAX_X_TICKS,
  });
  const plotBottom = HEIGHT - MARGIN.bottom;
  const bandWidth =
    geometry.xs.length > 1
      ? (geometry.xs[1] ?? 0) - (geometry.xs[0] ?? 0)
      : WIDTH - MARGIN.left - MARGIN.right;

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const next = moveCursor(event.key, cursor, lastIndex);
    if (next === null) return;
    // The arrows would otherwise scroll the page or the chart.
    event.preventDefault();
    setCursor(next);
  }

  const readout =
    cursor === null
      ? ""
      : [
          categories[cursor]?.label,
          ...series.map(
            (entry) => `${entry.label} ${entry.valueLabels[cursor] ?? ""}`,
          ),
        ].join(", ");

  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-wrap gap-x-6 gap-y-1">
        {series.map((entry) => (
          <li key={entry.id} className="flex items-center gap-2">
            <svg
              aria-hidden="true"
              focusable="false"
              width={LEGEND_MARKER_SIZE}
              height={LEGEND_MARKER_SIZE}
            >
              <Marker
                kind={entry.marker}
                x={LEGEND_MARKER_SIZE / 2}
                y={LEGEND_MARKER_SIZE / 2}
                size={LEGEND_MARKER_SIZE}
                tone={entry.tone}
              />
            </svg>
            {entry.label}
          </li>
        ))}
      </ul>

      {/* Focusable so that keyboard users can scroll it on a narrow screen and
          read it month by month. */}
      <div
        role="group"
        aria-label={label}
        aria-describedby={hintId}
        tabIndex={0}
        className="overflow-x-auto"
        onKeyDown={handleKeyDown}
        onFocus={() => setCursor((current) => current ?? lastIndex)}
        onBlur={() => setCursor(null)}
        onPointerLeave={(event) => {
          if (!event.currentTarget.matches(":focus-within")) setCursor(null);
        }}
      >
        <svg
          aria-hidden="true"
          focusable="false"
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="h-auto w-full min-w-[40rem]"
        >
          {geometry.yTicks.map((tick) => (
            <g key={tick.value}>
              <line
                x1={MARGIN.left}
                x2={WIDTH - MARGIN.right}
                y1={tick.y}
                y2={tick.y}
                className={tick.value === 0 ? "stroke-neutral-500" : "stroke-neutral-300"}
              />
              <text
                x={MARGIN.left - AXIS_LABEL_OFFSET}
                y={tick.y}
                textAnchor="end"
                dominantBaseline="middle"
                className="fill-neutral-700 text-xs"
              >
                {formatAmount(tick.value, currency, locale)}
              </text>
            </g>
          ))}

          {geometry.xTickIndexes.map((index) => (
            <text
              key={categories[index]?.key}
              x={geometry.xs[index]}
              y={plotBottom + X_LABEL_OFFSET}
              textAnchor="middle"
              className="fill-neutral-700 text-xs"
            >
              {categories[index]?.tickLabel}
            </text>
          ))}

          {cursor === null ? null : (
            <line
              x1={geometry.xs[cursor]}
              x2={geometry.xs[cursor]}
              y1={MARGIN.top}
              y2={plotBottom}
              className="stroke-neutral-500"
            />
          )}

          {series.map((entry, seriesIndex) => {
            const drawn = geometry.series[seriesIndex];
            return (
              <g key={entry.id}>
                <path
                  d={drawn?.path}
                  fill="none"
                  strokeWidth={LINE_WIDTH}
                  className={TONE_CLASSES[entry.tone].stroke}
                  data-series={entry.id}
                />
                {drawn?.points.map((point, index) => (
                  <Marker
                    key={categories[index]?.key}
                    kind={entry.marker}
                    x={point.x}
                    y={point.y}
                    size={index === cursor ? ACTIVE_MARKER_SIZE : MARKER_SIZE}
                    tone={entry.tone}
                    seriesId={entry.id}
                  />
                ))}
              </g>
            );
          })}

          {categories.map((category, index) => (
            <rect
              key={category.key}
              x={(geometry.xs[index] ?? 0) - bandWidth / 2}
              y={MARGIN.top}
              width={bandWidth}
              height={plotBottom - MARGIN.top}
              fill="transparent"
              onPointerEnter={() => setCursor(index)}
            />
          ))}
        </svg>
      </div>

      <p id={hintId} className="text-sm text-neutral-700">
        {hint}
      </p>
      <p aria-live="polite" className="min-h-6 font-medium">
        {readout}
      </p>
    </div>
  );
}
