"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";

import { moveCursor } from "../../../src/charts/cursor";
import type { LineChartCategory } from "../../../src/charts/line-chart";
import { formatAxisAmount } from "./axis-format";
import styles from "./trajectory-chart.module.css";
import { buildTrajectoryGeometry, monthAt, type MonthKind } from "./trajectory-geometry";
import { useElementWidth } from "./use-element-width";

export type TrajectoryTone = "primary" | "secondary";

/** A month: full label for the tooltip, short label with the year for the axis. */
export type TrajectoryMonth = LineChartCategory;

export interface TrajectorySeries {
  id: string;
  label: string;
  /** Series are told apart by this tone and by the name drawn on each line. */
  tone: TrajectoryTone;
  /** Month-end balances in minor units, one per month. */
  values: number[];
  /** The values as the reader sees them, one per month. */
  valueLabels: string[];
}

/** Words for real, today and planned months, shared by the chart and its table. */
export interface TrajectoryKindText {
  real: string;
  realToday: string;
  planned: string;
}

export interface TrajectoryChartText extends TrajectoryKindText {
  upToToday: string;
  plannedAhead: string;
  today: string;
}

export interface TrajectoryChartProps {
  /** Accessible name of the chart. */
  label: string;
  /** How to read the chart with the keyboard. */
  hint: string;
  currency: string;
  locale: string;
  months: TrajectoryMonth[];
  /** Index of the current month: real up to it, dated planned items after it. */
  todayIndex: number;
  series: TrajectorySeries[];
  /**
   * The one direct label of the chart: the lowest planned balance, given by the
   * domain indicator so that the chart and the indicator never disagree.
   */
  lowest?: { seriesId: string; index: number; label: string };
  text: TrajectoryChartText;
}

const HEIGHT = 280;
const FALLBACK_WIDTH = 640;
const MARGIN = { top: 28, right: 8, bottom: 36, left: 52 };
const MIN_LABEL_GAP = 52;
const PILL = { minWidth: 52, padding: 20, height: 22 };
const AXIS_LABEL_OFFSET = 8;
const ZONE_LABEL_OFFSET = 10;
const X_LABEL_BASELINE = 22;
const ACTIVE_MARKER = 11;
// Series names sit above the start of their line, on the real side, away from
// the lowest label which always lives on the planned side; two names never come
// closer than minGap.
const SERIES_LABEL = { lift: 10, minGap: 16 };
const NOTE = { below: 22, above: 14 };
const TIP_GAP = 14;

export function kindLabel(kind: MonthKind, text: TrajectoryKindText): string {
  return kind === "real" ? text.real : kind === "today" ? text.realToday : text.planned;
}


function toneClass(tone: TrajectoryTone): string | undefined {
  return styles[`tone${tone}`];
}

// Text is measured once the web font is in, or widths are those of the fallback.
function useFontsReady(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true;
    void document.fonts.ready.then(() => {
      if (active) setReady(true);
    });
    return () => {
      active = false;
    };
  }, []);
  return ready;
}

function textWidth(node: SVGTextElement | null): number {
  return node === null ? 0 : Math.ceil(node.getComputedTextLength());
}

export function TrajectoryChart({
  label,
  hint,
  currency,
  locale,
  months,
  todayIndex,
  series,
  lowest,
  text,
}: TrajectoryChartProps) {
  const hintId = useId();
  const plotRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const todayTextRef = useRef<SVGTextElement>(null);
  const beforeRef = useRef<SVGTextElement>(null);
  const afterRef = useRef<SVGTextElement>(null);
  const noteRef = useRef<SVGTextElement>(null);
  const width = useElementWidth(plotRef, FALLBACK_WIDTH);
  const fontsReady = useFontsReady();
  const [cursor, setCursor] = useState<number | null>(null);
  const [announced, setAnnounced] = useState("");
  const [pillWidth, setPillWidth] = useState(PILL.minWidth);
  const [beforeWidth, setBeforeWidth] = useState(0);
  const [afterWidth, setAfterWidth] = useState(0);
  const [noteWidth, setNoteWidth] = useState(0);
  const lastIndex = months.length - 1;

  // Rebuilt only when the data or the size change, not on every pointer move.
  const geometry = useMemo(
    () =>
      buildTrajectoryGeometry({
        width,
        height: HEIGHT,
        margin: MARGIN,
        categoryCount: months.length,
        todayIndex,
        series,
        minLabelGap: MIN_LABEL_GAP,
        todayLabelHalfWidth: pillWidth / 2,
      }),
    [width, months.length, todayIndex, series, pillWidth],
  );
  const { plot, xs } = geometry;
  const todayX = xs[todayIndex] ?? plot.left;
  const showBefore = beforeWidth + AXIS_LABEL_OFFSET <= todayX - plot.left;
  const showAfter = todayIndex < lastIndex && afterWidth + 2 * AXIS_LABEL_OFFSET <= plot.right - todayX;

  // Words change with the language: the Today pill fits its word, a zone label
  // that does not fit its zone is left out, and the lowest label stays inside
  // the planned zone.
  useLayoutEffect(() => {
    setPillWidth(Math.max(PILL.minWidth, textWidth(todayTextRef.current) + PILL.padding));
    setBeforeWidth(textWidth(beforeRef.current));
    setAfterWidth(textWidth(afterRef.current));
    setNoteWidth(textWidth(noteRef.current));
  }, [text.today, text.upToToday, text.plannedAhead, lowest?.label, fontsReady]);

  // The tooltip is placed after it renders, from its own size, so that it stays
  // inside the plot; writing the position directly avoids a second render.
  useLayoutEffect(() => {
    const tip = tipRef.current;
    if (tip === null || cursor === null) return;
    const cursorX = xs[cursor] ?? plot.left;
    const highest = Math.min(...geometry.series.map((entry) => entry.points[cursor]?.y ?? plot.bottom));
    const left = Math.min(Math.max(cursorX - tip.offsetWidth / 2, 0), width - tip.offsetWidth);
    const above = highest - tip.offsetHeight - TIP_GAP;
    tip.style.left = `${left}px`;
    tip.style.top = `${above < 0 ? highest + TIP_GAP : above}px`;
  }, [cursor, geometry, xs, plot, width]);

  function readout(index: number): string {
    const values = series.map((entry) => `${entry.label} ${entry.valueLabels[index] ?? ""}`);
    const kind = geometry.series[0]?.points[index]?.kind ?? "real";
    return [months[index]?.label, kindLabel(kind, text), ...values].join(". ");
  }

  function moveTo(index: number, announce: boolean) {
    if (index !== cursor) setCursor(index);
    if (announce) setAnnounced(readout(index));
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      setCursor(null);
      return;
    }
    // After Escape the cursor is gone: the next arrow starts again from today.
    const next = moveCursor(event.key, cursor ?? todayIndex, lastIndex);
    if (next === null) return;
    // The arrows would otherwise scroll the page.
    event.preventDefault();
    moveTo(next, true);
  }

  function pointerMonth(event: PointerEvent<HTMLDivElement>): number {
    return monthAt(geometry, event.clientX - event.currentTarget.getBoundingClientRect().left);
  }

  // Markers appear only on the month being read, never as a constant dot field.
  function markersAt(index: number, size: number) {
    return series.map((entry, seriesIndex) => {
      const point = geometry.series[seriesIndex]?.points[index];
      return point === undefined ? null : (
        <g key={entry.id} className={toneClass(entry.tone)}>
          <circle cx={point.x} cy={point.y} r={size / 2} className={styles.markerReal} />
        </g>
      );
    });
  }

  // Names above the first point of each line, pushed apart when two lines start close.
  const seriesLabels = series
    .map((entry, seriesIndex) => ({
      id: entry.id,
      label: entry.label,
      tone: entry.tone,
      y: (geometry.series[seriesIndex]?.points[0]?.y ?? plot.top) - SERIES_LABEL.lift,
    }))
    .sort((a, b) => a.y - b.y)
    .map((item, order, all) => {
      const previous = all[order - 1];
      if (previous !== undefined && item.y - previous.y < SERIES_LABEL.minGap) item.y = previous.y + SERIES_LABEL.minGap;
      return item;
    });

  const lowestSeries = geometry.series.findIndex((entry) => entry.id === lowest?.seriesId);
  const lowestPoint = lowest === undefined ? undefined : geometry.series[lowestSeries]?.points[lowest.index];

  return (
    <div className={styles.root}>
      <div
        ref={plotRef}
        role="group"
        aria-label={label}
        aria-describedby={hintId}
        tabIndex={0}
        className={styles.plot}
        onKeyDown={handleKeyDown}
        onFocus={() => moveTo(cursor ?? todayIndex, true)}
        onBlur={() => setCursor(null)}
        onPointerMove={(event) => moveTo(pointerMonth(event), false)}
        onPointerDown={(event) => moveTo(pointerMonth(event), true)}
        onPointerLeave={(event) => {
          if (!event.currentTarget.matches(":focus")) setCursor(null);
        }}
      >
        <svg aria-hidden="true" focusable="false" width={width} height={HEIGHT} className={styles.svg}>
          <rect
            className={styles.zone}
            x={todayX}
            y={plot.top}
            width={Math.max(0, plot.right - todayX)}
            height={plot.bottom - plot.top}
          />

          {geometry.yTicks.map((tick) => (
            <g key={tick.value}>
              <line
                x1={plot.left}
                x2={plot.right}
                y1={tick.y}
                y2={tick.y}
                className={tick.value === 0 ? styles.zero : styles.grid}
              />
              <text x={plot.left - AXIS_LABEL_OFFSET} y={tick.y} textAnchor="end" dominantBaseline="middle">
                {formatAxisAmount(tick.value, currency, locale)}
              </text>
            </g>
          ))}

          <text ref={beforeRef} x={plot.left} y={plot.top - ZONE_LABEL_OFFSET} visibility={showBefore ? "visible" : "hidden"}>
            {text.upToToday}
          </text>
          <text
            ref={afterRef}
            x={todayX + AXIS_LABEL_OFFSET}
            y={plot.top - ZONE_LABEL_OFFSET}
            visibility={showAfter ? "visible" : "hidden"}
          >
            {text.plannedAhead}
          </text>

          {series.map((entry, seriesIndex) => {
            const drawn = geometry.series[seriesIndex];
            if (drawn === undefined) return null;
            return (
              <g key={entry.id} className={toneClass(entry.tone)}>
                <path d={drawn.plannedPath} className={`${styles.planned ?? ""} ${styles.glow ?? ""}`} />
                <path d={drawn.realPath} className={`${styles.real ?? ""} ${styles.glow ?? ""}`} />
              </g>
            );
          })}

          <line className={styles.today} x1={todayX} x2={todayX} y1={plot.top} y2={plot.bottom} />

          {/* Each line is named, so series never rely on tone alone. */}
          {seriesLabels.map((item) => (
            <text key={item.id} className={`${toneClass(item.tone) ?? ""} ${styles.seriesLabel ?? ""}`} x={plot.left + AXIS_LABEL_OFFSET} y={item.y}>
              {item.label}
            </text>
          ))}

          {lowest !== undefined && lowestPoint !== undefined ? (
            <text
              ref={noteRef}
              className={styles.note}
              // Centred on its month, but kept inside the planned zone it describes.
              x={Math.min(Math.max(lowestPoint.x, todayX + AXIS_LABEL_OFFSET + noteWidth / 2), plot.right - noteWidth / 2)}
              y={lowestPoint.y + NOTE.below > plot.bottom - 6 ? lowestPoint.y - NOTE.above : lowestPoint.y + NOTE.below}
              textAnchor="middle"
            >
              {lowest.label}
            </text>
          ) : null}

          {geometry.xTicks.map((tick) => (
            <text key={months[tick.index]?.key} x={tick.x} y={plot.bottom + X_LABEL_BASELINE} textAnchor={tick.anchor}>
              {months[tick.index]?.tickLabel}
            </text>
          ))}
          <rect
            className={styles.todayPill}
            x={todayX - pillWidth / 2}
            y={plot.bottom + 6}
            width={pillWidth}
            height={PILL.height}
            rx={PILL.height / 2}
          />
          <text ref={todayTextRef} className={styles.todayText} x={todayX} y={plot.bottom + X_LABEL_BASELINE} textAnchor="middle">
            {text.today}
          </text>

          {cursor === null ? null : (
            <g>
              <line className={styles.crosshair} x1={xs[cursor]} x2={xs[cursor]} y1={plot.top} y2={plot.bottom} />
              {markersAt(cursor, ACTIVE_MARKER)}
            </g>
          )}
        </svg>

        {cursor === null ? null : (
          <div ref={tipRef} className={styles.tip}>
            <strong>
              {months[cursor]?.label} · {kindLabel(geometry.series[0]?.points[cursor]?.kind ?? "real", text)}
            </strong>
            {series.map((entry) => (
              <span key={entry.id} className={styles.tipRow}>
                <span>{entry.label}</span>
                <span>{entry.valueLabels[cursor]}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      <ul className={styles.legend}>
        <li>
          <svg aria-hidden="true" focusable="false" width="28" height="12" className={toneClass("primary")}>
            <line x1="0" x2="28" y1="6" y2="6" className={styles.real} />
          </svg>
          {text.real}
        </li>
        <li>
          <svg aria-hidden="true" focusable="false" width="28" height="12" className={toneClass("primary")}>
            <line x1="0" x2="28" y1="6" y2="6" className={styles.planned} />
          </svg>
          {text.planned}
        </li>
        <li>
          <svg aria-hidden="true" focusable="false" width="12" height="14">
            <line x1="6" x2="6" y1="0" y2="14" className={styles.today} />
          </svg>
          {text.today}
        </li>
      </ul>

      <p id={hintId} className={styles.hint}>
        {hint}
      </p>
      <p aria-live="polite" className={styles.srOnly}>
        {announced}
      </p>
    </div>
  );
}
