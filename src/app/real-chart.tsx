import { getLocale, getTimeZone, getTranslations } from "next-intl/server";

import { LineChart } from "../charts/line-chart";
import { formatAmount } from "../domain/money";
import { lastCompleteMonth } from "../domain/synthesis";
import { formatMonth, formatShortMonth, todayIn } from "../i18n/dates";
import { getReferenceCurrency } from "../ledger/exchange-rates";
import { getMonthlySynthesis } from "../ledger/synthesis";
import { withDatabase } from "../storage/with-database";

// The kinds of account drawn, with the marker and tone that tell them apart.
const CHART_SERIES = [
  { kind: "checking", marker: "circle", tone: "blue" },
  { kind: "savings", marker: "square", tone: "orange" },
] as const;

/**
 * The main chart: month-end totals of the checking and savings accounts, real
 * values only, with the equivalent data table. See DOMAIN, the real chart.
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

  return (
    <section aria-labelledby="real-chart-heading" className="mt-8 flex flex-col gap-4">
      <h2 id="real-chart-heading" className="text-xl font-semibold">
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
          <LineChart
            label={t("chartLabel")}
            hint={t("hint")}
            currency={referenceCurrency}
            locale={locale}
            categories={months.map((month) => ({
              key: month.month,
              label: formatMonth(month.month, locale),
              tickLabel: formatShortMonth(month.month, locale),
            }))}
            series={CHART_SERIES.map(({ kind, marker, tone }) => ({
              id: kind,
              label: kinds(kind),
              marker,
              tone,
              values: months.map((month) => month.totalByKind[kind]),
              valueLabels: months.map((month) => money(month.totalByKind[kind])),
            }))}
          />

          <h3 className="text-lg font-semibold">{t("tableHeading")}</h3>
          <div
            role="region"
            aria-label={t("tableHeading")}
            tabIndex={0}
            className="overflow-x-auto"
          >
            <table className="w-full border-collapse text-left">
              <caption className="sr-only">
                {t("tableCaption", { currency: referenceCurrency })}
              </caption>
              <thead>
                <tr className="border-b border-neutral-500">
                  <th scope="col" className="py-2 pr-4">{t("columns.month")}</th>
                  {CHART_SERIES.map(({ kind }) => (
                    <th key={kind} scope="col" className="py-2 pl-4 text-right">
                      {kinds(kind)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {months.map((month) => (
                  <tr key={month.month} className="border-b border-neutral-300">
                    <th scope="row" className="py-2 pr-4 font-medium">
                      <time dateTime={month.month}>
                        {formatMonth(month.month, locale)}
                      </time>
                    </th>
                    {CHART_SERIES.map(({ kind }) => (
                      <td key={kind} className="py-2 pl-4 text-right tabular-nums">
                        {money(month.totalByKind[kind])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
