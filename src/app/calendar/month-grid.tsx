import type { ReactNode } from "react";

import { buildMonthGrid, DAYS_IN_WEEK, weekStartOf } from "../../components/date-picker-keyboard";
import { parseDate } from "../../domain/calendar-date";
import { formatAmount } from "../../domain/money";
import { formatFullCalendarDate, formatMonthName, formatWeekday } from "../../i18n/dates";
import type { CalendarDay, CalendarMonth } from "../../ledger/calendar";
import { CalendarLinesTable, type CalendarLinesTableText } from "./lines/calendar-lines-table";
import { MonthGridClient } from "./month-grid-client";

export interface MonthGridText {
  /** Names the grid: the month and the year. */
  label: string;
  today: string;
  belowZero: string;
  unplacedSurplus: string;
  /** "2 real": the plural is the translation's job. */
  real: (count: number) => string;
  planned: (count: number) => string;
  /** The words of the name of a cell, in lower case: they sit in the middle of a sentence. */
  name: {
    today: string;
    balance: string;
    noEntries: string;
    belowZero: string;
    unplacedSurplus: string;
  };
  /** What the glyphs of a compact cell mean; drawn on a narrow column only. */
  legend: string;
}

/** What the details of a day need besides the month: the lines are the line view's. */
interface MonthGridDetails {
  accounts: { id: number; name: string }[];
  lines: Omit<CalendarLinesTableText, "caption">;
  text: { balance: string; noEntries: string };
}

export interface MonthGridProps {
  month: CalendarMonth;
  locale: string;
  /** YYYY-MM-DD. */
  today: string;
  linesHref: (date: string) => string;
  text: MonthGridText;
  /** Without it, a day only links to the line view. */
  details?: MonthGridDetails;
}

// The classes below switch at 744 px of column (DESIGN section 18): 7 cells of 96 px, 6 gaps of 4 px and
// the padding of the card. Tailwind reads whole class names, so the width is written in each one.
const LEGEND_ID = "month-grid-legend";
const DETAILS_HEADING_ID = "month-grid-day-heading";

// Inside the selected cell every element turns `on-primary`: the words carry the meaning, since red,
// amber and muted text fail on the ink fill. The link switches its own colour so that every child
// without a colour of its own follows; the spans that set one repeat `ON_SELECTED`.
const ON_SELECTED = "group-data-[selected=true]:text-on-primary";
const CELL_CLASS = [
  `block min-h-14 rounded-control p-1 pt-2 text-center text-caption text-text transition-colors ${ON_SELECTED}`,
  "hover:bg-surface-sunken",
  "group-data-[selected=true]:bg-primary group-data-[selected=true]:hover:bg-primary",
  `@min-[744px]:min-h-26 @min-[744px]:min-w-24 @min-[744px]:border @min-[744px]:border-divider @min-[744px]:bg-surface @min-[744px]:p-2 @min-[744px]:text-left`,
  `@min-[744px]:group-data-[selected=true]:border-primary`,
].join(" ");
const TODAY_RING =
  "shadow-[inset_0_0_0_1.5px_var(--color-accent)] group-data-[selected=true]:shadow-none";
const COMPACT_ONLY = "@min-[744px]:hidden";
const WIDE_ONLY = "hidden @min-[744px]:flex";

interface DayView {
  day: CalendarDay;
  number: number;
  isToday: boolean;
  realCount: number;
  plannedCount: number;
  hasUnplacedSurplus: boolean;
  balance: string | null;
}

function dayViewOf(day: CalendarDay, today: string, currency: string, locale: string): DayView {
  const plannedCount = day.entries.filter((entry) => entry.kind === "planned").length;
  return {
    day,
    number: parseDate(day.date).day,
    isToday: day.date === today,
    realCount: day.entries.length - plannedCount,
    plannedCount,
    hasUnplacedSurplus: day.entries.some((entry) => entry.unplacedSurplus !== null),
    balance: day.balance === null ? null : formatAmount(day.balance, currency, locale),
  };
}

// The counts of real and planned entries, in words; none for a kind that has no entry.
function countsOf({ realCount, plannedCount }: DayView, text: MonthGridText): string[] {
  const counts: string[] = [];
  if (realCount > 0) counts.push(text.real(realCount));
  if (plannedCount > 0) counts.push(text.planned(plannedCount));
  return counts;
}

// Everything the visible cell shows, said in one sentence: the content is hidden from the name.
function cellNameOf(
  view: DayView,
  monthName: string,
  { month, locale, text }: MonthGridProps,
): string {
  const { day, isToday, hasUnplacedSurplus } = view;
  const parts = [`${view.number} ${monthName}`];
  if (isToday) parts.push(text.name.today);
  if (day.balance !== null) {
    parts.push(`${text.name.balance} ${formatAmount(day.balance, month.currency, locale, "code")}`);
  }
  parts.push(...countsOf(view, text));
  if (day.entries.length === 0) parts.push(text.name.noEntries);
  if (day.isBelowZero) parts.push(text.name.belowZero);
  if (hasUnplacedSurplus) parts.push(text.name.unplacedSurplus);
  return parts.join(", ");
}

function WideContent({ view, text }: { view: DayView; text: MonthGridText }) {
  const { isToday, realCount, plannedCount } = view;
  const accent = `text-accent ${ON_SELECTED}`;

  return (
    <span className={`${WIDE_ONLY} min-h-22 flex-col`}>
      <span className="flex items-baseline justify-between gap-1 font-medium">
        <span className={`tabular-nums ${isToday ? accent : ""}`}>{view.number}</span>
        {isToday ? <span className={accent}>{text.today}</span> : null}
      </span>
      {view.balance === null ? null : (
        <span className="block text-right tabular-nums">{view.balance}</span>
      )}
      {view.day.isBelowZero ? (
        <span className={`block text-right font-medium text-negative ${ON_SELECTED}`}>
          {text.belowZero}
        </span>
      ) : null}
      {view.hasUnplacedSurplus ? (
        <span className={`block font-medium text-warning ${ON_SELECTED}`}>
          {text.unplacedSurplus}
        </span>
      ) : null}
      <span className="mt-auto flex flex-col">
        {realCount > 0 ? <span>{text.real(realCount)}</span> : null}
        {plannedCount > 0 ? (
          <span className={`text-text-muted ${ON_SELECTED}`}>
            <span
              aria-hidden="true"
              className="mr-1.5 inline-block w-3 border-t-[1.5px] border-dashed border-text-muted align-middle group-data-[selected=true]:border-on-primary"
            />
            {text.planned(plannedCount)}
          </span>
        ) : null}
      </span>
    </span>
  );
}

// The same facts as three glyphs, always repeated in words by the name of the cell and the details.
function CompactContent({ view }: { view: DayView }) {
  const accent = `text-accent ${ON_SELECTED}`;

  return (
    <span className={`${COMPACT_ONLY} block`}>
      <span className={`block font-medium tabular-nums ${view.isToday ? accent : ""}`}>
        {view.number}
      </span>
      <span aria-hidden="true" className="mt-1 flex h-1.5 items-center justify-center gap-[3px]">
        {view.realCount > 0 ? (
          <span className="size-1.5 rounded-pill bg-text group-data-[selected=true]:bg-on-primary" />
        ) : null}
        {view.plannedCount > 0 ? (
          <span className="size-1.5 rounded-pill border-[1.5px] border-text-muted group-data-[selected=true]:border-on-primary" />
        ) : null}
        {view.day.isBelowZero ? (
          <span className="h-[3px] w-3 rounded-pill bg-negative group-data-[selected=true]:bg-on-primary" />
        ) : null}
      </span>
    </span>
  );
}

function DayCell({
  view,
  monthName,
  props,
}: {
  view: DayView;
  monthName: string;
  props: MonthGridProps;
}) {
  const { day, isToday } = view;

  return (
    <div
      role="gridcell"
      aria-label={cellNameOf(view, monthName, props)}
      aria-current={isToday ? "date" : undefined}
      className="group"
    >
      <a
        href={props.linesHref(day.date)}
        data-date={day.date}
        className={`${CELL_CLASS} ${isToday ? TODAY_RING : ""}`}
      >
        <WideContent view={view} text={props.text} />
        <CompactContent view={view} />
      </a>
    </div>
  );
}

function DayDetails({
  view,
  props,
  details,
}: {
  view: DayView;
  props: MonthGridProps;
  details: MonthGridDetails;
}) {
  const { month, locale, text } = props;
  const { day } = view;
  const date = formatFullCalendarDate(day.date, locale);
  const counts = countsOf(view, text).join(", ");
  const accountNames = new Map(details.accounts.map(({ id, name }) => [id, name]));
  const surplusLines = day.entries.flatMap(({ unplacedSurplus, currency }) =>
    unplacedSurplus === null
      ? []
      : [
          details.lines.unplacedSurplus(
            formatAmount(unplacedSurplus.amount, currency, locale),
            accountNames.get(unplacedSurplus.accountId) ?? "",
          ),
        ],
  );

  // The counts name the entries table: its region must not repeat the date that names this section.
  return (
    <section aria-labelledby={DETAILS_HEADING_ID} className="mt-4 flex flex-col gap-4">
      <div className="rounded-card bg-surface p-4 @3xl:p-6">
        <h3
          id={DETAILS_HEADING_ID}
          tabIndex={-1}
          data-day-heading=""
          className="text-title font-medium"
        >
          {date}
          {view.isToday ? <span className="ml-2 font-medium text-accent">{text.today}</span> : null}
        </h3>
        {view.balance === null ? null : (
          <>
            <p className="mt-4 flex flex-wrap items-baseline gap-x-3">
              <span className="text-amount tabular-nums">{view.balance}</span>
              {day.isBelowZero ? (
                <span className="font-medium text-negative">{text.belowZero}</span>
              ) : null}
            </p>
            <p className="text-label font-medium uppercase text-text-muted">
              {details.text.balance}
            </p>
          </>
        )}
        {surplusLines.map((line) => (
          <p key={line} className="mt-2 text-caption text-warning">
            {line}
          </p>
        ))}
        {day.entries.length === 0 ? (
          <p className="mt-4 text-text-muted">{details.text.noEntries}</p>
        ) : null}
      </div>
      {day.entries.length === 0 ? null : (
        <CalendarLinesTable
          // The grid already says once, above itself, which currencies are left out.
          month={{ ...month, days: [day], firstDayBelowZero: null, unconvertedCurrencies: [] }}
          accounts={details.accounts}
          locale={locale}
          text={{ ...details.lines, caption: counts }}
          backView="grid"
        />
      )}
    </section>
  );
}

// The day the grid is entered on: today if it is in the month, else the first of the month.
function entryDateOf({ month, today }: MonthGridProps): string {
  return today.startsWith(`${month.month}-`) ? today : `${month.month}-01`;
}

function WeekdayRow({ weekStart, locale }: { weekStart: number; locale: string }) {
  return (
    <div role="row" className="grid grid-cols-7 @min-[744px]:gap-1">
      {Array.from({ length: DAYS_IN_WEEK }, (_, index) => {
        const weekday = (weekStart + index) % DAYS_IN_WEEK;
        return (
          <div
            key={weekday}
            role="columnheader"
            aria-label={formatWeekday(weekday, locale, "long")}
            className="flex h-8 items-center justify-center text-label uppercase text-text-muted"
          >
            {formatWeekday(weekday, locale, "short")}
          </div>
        );
      })}
    </div>
  );
}

interface WeekRowProps {
  week: readonly string[];
  views: ReadonlyMap<string, DayView>;
  monthName: string;
  props: MonthGridProps;
}

function WeekRow({ week, views, monthName, props }: WeekRowProps) {
  return (
    <div role="row" className="grid grid-cols-7 @min-[744px]:gap-1">
      {week.map((date) => {
        const view = views.get(date);
        return view === undefined ? (
          <div key={date} role="gridcell" />
        ) : (
          <DayCell key={date} view={view} monthName={monthName} props={props} />
        );
      })}
    </div>
  );
}

/**
 * The days of a month with the end-of-day balance and the counts of entries (DESIGN section 18).
 * Server markup that already works: every day is a link to the line view, all of them focusable.
 * `MonthGridClient` adds the single tab stop, the keyboard and the details panel.
 */
export function MonthGrid(props: MonthGridProps): ReactNode {
  const { month, locale, today, text, details } = props;
  const weekStart = weekStartOf(locale);
  const entryDate = entryDateOf(props);
  const monthName = formatMonthName(month.month, locale);
  const views = new Map(
    month.days.map((day) => [day.date, dayViewOf(day, today, month.currency, locale)]),
  );
  const detailsByDate = Object.fromEntries(
    details === undefined
      ? []
      : [...views].map(([date, view]) => [
          date,
          <DayDetails key={date} view={view} props={props} details={details} />,
        ]),
  );

  return (
    <MonthGridClient
      key={month.month}
      month={month.month}
      weekStart={weekStart}
      entryDate={entryDate}
      details={detailsByDate}
    >
      <div className="@container">
        {month.unconvertedCurrencies.length === 0 || details === undefined ? null : (
          <p className="pb-3 text-caption text-text-muted">
            {details.lines.unconverted(month.unconvertedCurrencies.join(", "))}
          </p>
        )}
        <div className="rounded-card bg-surface py-3 @min-[744px]:p-6">
          <p id={LEGEND_ID} className={`${COMPACT_ONLY} px-3 pb-2 text-caption text-text-muted`}>
            {text.legend}
          </p>
          <div
            role="grid"
            aria-label={text.label}
            aria-describedby={LEGEND_ID}
            className="flex flex-col @min-[744px]:gap-1"
          >
            <WeekdayRow weekStart={weekStart} locale={locale} />
            {buildMonthGrid(month.month, weekStart).map((week) => (
              <WeekRow
                key={week[0]}
                week={week}
                views={views}
                monthName={monthName}
                props={props}
              />
            ))}
          </div>
        </div>
      </div>
    </MonthGridClient>
  );
}
