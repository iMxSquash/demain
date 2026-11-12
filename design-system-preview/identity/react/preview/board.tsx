/**
 * The trajectory chart on brand-board.html, so the board shows the reference
 * chart instead of a second drawing of it. Its esbuild bundle is inlined in the
 * page between the board-chart markers. The board keeps its own horizon buttons
 * (`[data-ahead]`, the pressed one sets the start) and this entry follows them.
 * Synthetic data only.
 */

import { createRoot } from "react-dom/client";

import { formatAmount } from "../../../../src/domain/money";
import { formatMonth, formatShortMonth } from "../../../../src/i18n/dates";
import { TrajectoryChart, type TrajectorySeries } from "../trajectory-chart";
import { TrajectoryTable } from "../trajectory-table";

const LOCALE = "en";
const CURRENCY = "EUR";
const MONTHS = [
  "2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11",
  "2026-12", "2027-01", "2027-02", "2027-03", "2027-04", "2027-05",
  "2027-06", "2027-07", "2027-08", "2027-09", "2027-10", "2027-11",
];
const TODAY_INDEX = 5;
// Month-end balances in minor units; today they add up to the board's total,
// €12,480.50. After today: dated planned items only.
const CHECKING = [
  210000, 245000, 182000, 230000, 265000, 248050,
  174050, 298050, 221050, 260050, 235050, 282050,
  210050, 120050, 195050, 240050, 260050, 238050,
];
const SAVINGS = [
  920000, 936000, 952000, 968000, 984000, 1000000,
  1016000, 1032000, 1048000, 1064000, 1080000, 1096000,
  1112000, 1128000, 1144000, 1160000, 1176000, 1192000,
];

const TEXT = {
  checking: "Checking",
  savings: "Savings",
  chartLabel: "Month-end balances of checking and savings accounts, real up to today, then dated planned items only.",
  hint: "Point at the chart, or focus it and use the left and right arrow keys, Home and End, to read each month. Escape hides the reading.",
  upToToday: "Up to today",
  plannedAhead: "Planned ahead",
  today: "Today",
  real: "Real",
  realToday: "Real, today",
  planned: "Planned, dated",
  table: "Data table",
  caption: "Month-end balances, checking and savings",
  month: "Month",
  kind: "Kind",
};

function money(minor: number): string {
  return formatAmount(minor, CURRENCY, LOCALE);
}

// The data never changes: labels are formatted once, each horizon only slices them.
const ALL_MONTHS = MONTHS.map((key) => ({
  key,
  label: formatMonth(key, LOCALE),
  tickLabel: formatShortMonth(key, LOCALE),
}));
const ALL_SERIES: TrajectorySeries[] = [
  { id: "checking", label: TEXT.checking, tone: "primary", values: CHECKING, valueLabels: CHECKING.map(money) },
  { id: "savings", label: TEXT.savings, tone: "secondary", values: SAVINGS, valueLabels: SAVINGS.map(money) },
];

function BoardTrajectory({ ahead }: { ahead: number }) {
  const count = TODAY_INDEX + 1 + ahead;
  const months = ALL_MONTHS.slice(0, count);
  const series = ALL_SERIES.map((entry) => ({
    ...entry,
    values: entry.values.slice(0, count),
    valueLabels: entry.valueLabels.slice(0, count),
  }));
  // Stands in for the domain indicator "minimum balance and its date".
  const planned = CHECKING.slice(TODAY_INDEX + 1, count);
  const lowestIndex = TODAY_INDEX + 1 + planned.indexOf(Math.min(...planned));
  const lowest = { seriesId: "checking", index: lowestIndex, label: `Lowest ${money(CHECKING[lowestIndex] ?? 0)}` };

  return (
    <>
      <TrajectoryChart
        label={TEXT.chartLabel}
        hint={TEXT.hint}
        currency={CURRENCY}
        locale={LOCALE}
        months={months}
        todayIndex={TODAY_INDEX}
        series={series}
        lowest={lowest}
        text={TEXT}
      />
      <details className="trajectory-data">
        <summary className="cap">{TEXT.table}</summary>
        <div className="scroll">
          <TrajectoryTable months={months} todayIndex={TODAY_INDEX} series={series} text={TEXT} />
        </div>
      </details>
    </>
  );
}

const container = document.getElementById("trajectory-root");
if (container !== null) {
  const root = createRoot(container);
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-ahead]"));
  const pressed = buttons.find((button) => button.getAttribute("aria-pressed") === "true");
  let current = Number(pressed?.dataset.ahead);
  const render = () => root.render(<BoardTrajectory ahead={current} />);
  for (const button of buttons) {
    button.addEventListener("click", () => {
      const ahead = Number(button.dataset.ahead);
      if (ahead === current) return;
      current = ahead;
      for (const other of buttons) other.setAttribute("aria-pressed", String(other === button));
      render();
    });
  }
  render();
}
