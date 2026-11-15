import { getLocale, getTimeZone, getTranslations } from "next-intl/server";

import { TrajectoryChart } from "../charts/trajectory-chart";
import { TrajectoryTable } from "../charts/trajectory-table";
import type { TrajectoryMonth, TrajectorySeries } from "../charts/trajectory-types";
import { formatAmount } from "../domain/money";
import { lastCompleteMonth } from "../domain/synthesis";
import { formatMonth, formatShortMonth, todayIn } from "../i18n/dates";
import { getReferenceCurrency } from "../ledger/exchange-rates";
import { getMonthlySynthesis } from "../ledger/synthesis";
import { withDatabase } from "../storage/with-database";

// The kinds of account drawn, with the tone that tells them apart (each line
// also carries its name).
const CHART_SERIES = [
  { kind: "checking", tone: "primary" },
  { kind: "savings", tone: "secondary" },
] as const;

/**
 * The main chart: month-end totals of the checking and savings accounts, real
 * values only, with the equivalent data table. See DOMAIN, the real chart.
 * No dated planned item is available yet, so every month is real and today is
 * the last one: the planned parts of the chart stay hidden (ADR-011).
 */
export async function RealChart() {
  const [t, kinds, locale, timeZone] = await Promise.all([
    getTranslations("realChart"),
    getTranslations("accounts.kinds"),
    getLocale(),
    getTimeZone(),
  ]);
  const throughMonth = lastCompleteMonth(todayIn(timeZone, new Date()));
  const { months, referenceCurrency } = withDatabase((db) => {
    const referenceCurrency = getReferenceCurrency(db);
    return {
      months: getMonthlySynthesis(db, { referenceCurrency, throughMonth }),
      referenceCurrency,
    };
  });
  const money = (minorUnits: number) =>
    formatAmount(minorUnits, referenceCurrency, locale);
  const unconverted = [
    ...new Set(months.flatMap((month) => month.unconvertedCurrencies)),
  ].sort();

  const chartMonths: TrajectoryMonth[] = months.map((month) => ({
    key: month.month,
    label: formatMonth(month.month, locale),
    tickLabel: formatShortMonth(month.month, locale),
  }));
  // Today is the last month: nothing is planned yet.
  const todayIndex = chartMonths.length - 1;
  const chartSeries: TrajectorySeries[] = CHART_SERIES.map(({ kind, tone }) => ({
    id: kind,
    label: kinds(kind),
    tone,
    values: months.map((month) => month.totalByKind[kind]),
    valueLabels: months.map((month) => money(month.totalByKind[kind])),
  }));
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
        <p role="status">
          {t("unconverted", { currencies: unconverted.join(", ") })}
        </p>
      ) : null}

      {months.length === 0 ? (
        <p>{t("empty")}</p>
      ) : (
        <>
          <TrajectoryChart
            label={t("chartLabel")}
            hint={t("hint")}
            currency={referenceCurrency}
            locale={locale}
            months={chartMonths}
            todayIndex={todayIndex}
            series={chartSeries}
            text={kindText}
          />

          <h3 className="text-title font-medium">{t("tableHeading")}</h3>
          <div
            role="region"
            aria-label={t("tableHeading")}
            tabIndex={0}
            className="overflow-x-auto"
          >
            <TrajectoryTable
              months={chartMonths}
              todayIndex={todayIndex}
              series={chartSeries}
              text={{
                ...kindText,
                caption: t("tableCaption", { currency: referenceCurrency }),
                month: t("columns.month"),
                kind: t("columns.kind"),
              }}
            />
          </div>
        </>
      )}
    </section>
  );
}
