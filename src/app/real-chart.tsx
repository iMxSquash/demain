import { getLocale, getTimeZone, getTranslations } from "next-intl/server";
import { connection } from "next/server";

import type { TrajectoryMonth, TrajectorySeries } from "../charts/trajectory-types";
import { formatAmount } from "../domain/money";
import { lastCompleteMonth } from "../domain/synthesis";
import { formatMonth, formatShortMonth, todayIn } from "../i18n/dates";
import { getReferenceCurrency } from "../ledger/exchange-rates";
import { getPlannedTrajectory } from "../ledger/projection";
import { getMonthlySynthesis } from "../ledger/synthesis";
import { withDatabase } from "../storage/with-database";
import { requireSession } from "./auth/session";
import { tagDataRead } from "./data-cache";
import { RealChartView } from "./real-chart-view";

// The kinds of account drawn, with the tone that tells them apart (each line
// also carries its name).
const CHART_SERIES = [
  { kind: "checking", tone: "primary" },
  { kind: "savings", tone: "secondary" },
] as const;

// The longest horizon the view offers: it is read once and sliced in the browser.
const PLANNED_MONTHS = 12;

// Today is an argument, so the entry of yesterday is not served once the day changes (planned
// occurrences depend on the day, not only on the month).
async function readChartMonths(today: string) {
  "use cache";
  tagDataRead();
  return withDatabase((db) => {
    const referenceCurrency = getReferenceCurrency(db);
    return {
      months: getMonthlySynthesis(db, {
        referenceCurrency,
        throughMonth: lastCompleteMonth(today),
      }),
      plannedMonths: getPlannedTrajectory(db, { referenceCurrency, today, months: PLANNED_MONTHS }),
      referenceCurrency,
    };
  });
}

/**
 * The main chart: month-end totals of the checking and savings accounts, real
 * up to the last complete month, then the dated planned items from the current
 * month on, with the equivalent data table. See DOMAIN, the real chart.
 * Nothing else is estimated (ADR-011): without a planned item still to come,
 * the planned part stays hidden.
 */
export async function RealChart() {
  await requireSession();
  // The chart reads the database and the clock: it must run per request.
  await connection();
  const [t, kinds, locale, timeZone] = await Promise.all([
    getTranslations("realChart"),
    getTranslations("accounts.kinds"),
    getLocale(),
    getTimeZone(),
  ]);
  const {
    months: realMonths,
    plannedMonths,
    referenceCurrency,
  } = await readChartMonths(todayIn(timeZone, new Date()));
  // Without real months the chart has no today to anchor on, so no planned month is drawn either.
  const planned = realMonths.length === 0 ? [] : plannedMonths;
  const money = (minorUnits: number) => formatAmount(minorUnits, referenceCurrency, locale);
  const unconverted = [
    ...new Set([...realMonths, ...planned].flatMap((month) => month.unconvertedCurrencies)),
  ].sort();

  const chartMonths: TrajectoryMonth[] = [...realMonths, ...planned].map((month) => ({
    key: month.month,
    label: formatMonth(month.month, locale),
    tickLabel: formatShortMonth(month.month, locale),
  }));
  // The last complete month is today: the planned months start with the current one.
  const todayIndex = realMonths.length - 1;
  const chartSeries: TrajectorySeries[] = CHART_SERIES.map(({ kind, tone }) => {
    const values = [
      ...realMonths.map((month) => month.totalByKind[kind]),
      ...planned.map((month) => month[kind]),
    ];
    return { id: kind, label: kinds(kind), tone, values, valueLabels: values.map(money) };
  });
  const kindText = {
    real: t("kinds.real"),
    realToday: t("kinds.realToday"),
    planned: t("kinds.planned"),
    upToToday: t("upToToday"),
    plannedAhead: t("plannedAhead"),
    today: t("today"),
  };

  return (
    <section aria-labelledby="real-chart-heading" className="mt-8 flex flex-col gap-4">
      <h2 id="real-chart-heading" className="text-title font-medium">
        {t("heading")}
      </h2>
      <p>{t("intro", { currency: referenceCurrency })}</p>

      {unconverted.length > 0 ? (
        <p role="status">{t("unconverted", { currencies: unconverted.join(", ") })}</p>
      ) : null}

      {realMonths.length === 0 ? (
        <p>{t("empty")}</p>
      ) : (
        <RealChartView
          label={t("chartLabel")}
          hint={t("hint")}
          currency={referenceCurrency}
          locale={locale}
          months={chartMonths}
          todayIndex={todayIndex}
          series={chartSeries}
          tableHeading={t("tableHeading")}
          text={{
            ...kindText,
            caption: t("tableCaption", { currency: referenceCurrency }),
            month: t("columns.month"),
            kind: t("columns.kind"),
            horizonLegend: t("horizon.legend"),
            horizonOptions: {
              3: t("horizon.months3"),
              6: t("horizon.months6"),
              12: t("horizon.months12"),
            },
          }}
        />
      )}
    </section>
  );
}
