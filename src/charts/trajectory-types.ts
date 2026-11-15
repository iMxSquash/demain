/**
 * Types and words shared by the trajectory chart (a client component) and its
 * table (rendered on the server). They live outside the client module because
 * a server component cannot call a function exported from one.
 */

import type { MonthKind } from "./trajectory-geometry";

export type TrajectoryTone = "primary" | "secondary";

/** A month: full label for the reading, short label with the year for the axis. */
export interface TrajectoryMonth {
  key: string;
  label: string;
  tickLabel: string;
}

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

export function kindLabel(kind: MonthKind, text: TrajectoryKindText): string {
  if (kind === "real") return text.real;
  return kind === "today" ? text.realToday : text.planned;
}
