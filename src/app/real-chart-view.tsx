"use client";

import { useState } from "react";

import { TrajectoryChart, type TrajectoryChartText } from "../charts/trajectory-chart";
import { TrajectoryTable, type TrajectoryTableText } from "../charts/trajectory-table";
import type { TrajectoryMonth, TrajectorySeries } from "../charts/trajectory-types";
import { lowestPlannedIndex } from "../domain/projection";

const HORIZONS = [3, 6, 12] as const;
type Horizon = (typeof HORIZONS)[number];

const DEFAULT_HORIZON: Horizon = 6;
// The lowest planned balance is read on the checking series (issue 171).
const LOWEST_SERIES_ID = "checking";

export interface RealChartViewProps {
  label: string;
  hint: string;
  currency: string;
  locale: string;
  /** The real months followed by every planned month the server read. */
  months: TrajectoryMonth[];
  /** Index of the last real month: the months after it are planned. */
  todayIndex: number;
  series: TrajectorySeries[];
  defaultHorizon?: Horizon;
  /** Heading of the table, which also names its scroll region; the caption when absent. */
  tableHeading?: string;
  text: TrajectoryChartText &
    TrajectoryTableText & {
      horizonLegend: string;
      horizonOptions: Record<Horizon, string>;
    };
}

/**
 * The chart and its table, with the horizon of the planned part chosen in the browser: the
 * server reads the longest horizon once and this view slices it, so changing it costs no request.
 * The chart and the table always receive the same sliced arrays.
 */
export function RealChartView({
  label,
  hint,
  currency,
  locale,
  months,
  todayIndex,
  series,
  defaultHorizon = DEFAULT_HORIZON,
  tableHeading,
  text,
}: RealChartViewProps) {
  const [horizon, setHorizon] = useState<Horizon>(defaultHorizon);
  const hasPlanned = months.length > todayIndex + 1;
  const visibleCount = hasPlanned ? todayIndex + 1 + horizon : months.length;
  const visibleMonths = months.slice(0, visibleCount);
  const visibleSeries = series.map((entry) => ({
    ...entry,
    values: entry.values.slice(0, visibleCount),
    valueLabels: entry.valueLabels.slice(0, visibleCount),
  }));

  const lowestSeries = visibleSeries.find((entry) => entry.id === LOWEST_SERIES_ID);
  const lowestIndex = lowestSeries ? lowestPlannedIndex(lowestSeries.values, todayIndex) : null;
  const lowest =
    lowestSeries && lowestIndex !== null
      ? {
          seriesId: lowestSeries.id,
          index: lowestIndex,
          label: lowestSeries.valueLabels[lowestIndex] ?? "",
        }
      : undefined;
  const heading = tableHeading ?? text.caption;

  return (
    <>
      {hasPlanned ? (
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1 text-caption font-medium text-text">{text.horizonLegend}</legend>
          {/* A utility class, not an inline style: the CSP forbids style attributes. */}
          <div className="segmented self-start [--n:3]">
            {HORIZONS.map((option) => (
              <label key={option}>
                <input
                  type="radio"
                  name="real-chart-horizon"
                  value={option}
                  checked={option === horizon}
                  onChange={() => setHorizon(option)}
                />
                {text.horizonOptions[option]}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      <TrajectoryChart
        label={label}
        hint={hint}
        currency={currency}
        locale={locale}
        months={visibleMonths}
        todayIndex={todayIndex}
        series={visibleSeries}
        {...(lowest ? { lowest } : {})}
        text={text}
      />

      <h3 className="text-title font-medium">{heading}</h3>
      <div role="region" aria-label={heading} tabIndex={0} className="overflow-x-auto">
        <TrajectoryTable
          months={visibleMonths}
          todayIndex={todayIndex}
          series={visibleSeries}
          text={text}
        />
      </div>
    </>
  );
}
