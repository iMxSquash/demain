/**
 * Preview of the trajectory chart with synthetic data, built with esbuild for
 * review only. In the app, the server component computes the months and the
 * labels with next-intl, as `src/app/real-chart.tsx` does.
 */

import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";

import { formatAmount } from "../../../../src/domain/money";
import { formatMonth, formatShortMonth } from "../../../../src/i18n/dates";
import { TrajectoryChart, type TrajectorySeries } from "../trajectory-chart";
import { TrajectoryTable } from "../trajectory-table";

type Locale = "en" | "fr";

const CURRENCY = "EUR";
const MONTHS = [
  "2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11",
  "2026-12", "2027-01", "2027-02", "2027-03", "2027-04", "2027-05",
  "2027-06", "2027-07", "2027-08", "2027-09", "2027-10", "2027-11",
];
const TODAY_INDEX = 5;
// Synthetic month-end totals in minor units. After today: dated planned items only.
const CHECKING = [
  210000, 245000, 182000, 230000, 265000, 248050,
  174050, 298050, 221050, 260050, 235050, 282050,
  210050, 120050, 195050, 240050, 260050, 238050,
];
const SAVINGS = [
  1800000, 1820000, 1840000, 1860000, 1880000, 1900000,
  1920000, 1940000, 1960000, 1980000, 2000000, 2020000,
  2040000, 2060000, 2080000, 2100000, 2120000, 2140000,
];
const HORIZONS = [3, 6, 12] as const;

const TEXT = {
  en: {
    heading: "Balance trajectory",
    horizon: "Months ahead",
    months: (count: number) => `${count} months`,
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
    lowest: (amount: string) => `Lowest ${amount}`,
    table: "Data table",
    caption: "Month-end balances, checking and savings",
    month: "Month",
    kind: "Kind",
  },
  fr: {
    heading: "Trajectoire des soldes",
    horizon: "Mois à venir",
    months: (count: number) => `${count} mois`,
    checking: "Courant",
    savings: "Épargne",
    chartLabel: "Soldes de fin de mois des comptes courants et d’épargne, réels jusqu’à aujourd’hui, puis prévisions datées uniquement.",
    hint: "Survolez le graphique, ou donnez-lui le focus et utilisez les flèches gauche et droite, Début et Fin, pour lire chaque mois. Échap masque la lecture.",
    upToToday: "Jusqu’à aujourd’hui",
    plannedAhead: "Prévu",
    today: "Aujourd’hui",
    real: "Réel",
    realToday: "Réel, aujourd’hui",
    planned: "Prévu, daté",
    lowest: (amount: string) => `Minimum ${amount}`,
    table: "Tableau des données",
    caption: "Soldes de fin de mois, courant et épargne",
    month: "Mois",
    kind: "Nature",
  },
};

function Preview() {
  const [locale, setLocale] = useState<Locale>("en");
  const [ahead, setAhead] = useState<(typeof HORIZONS)[number]>(6);
  const t = TEXT[locale];
  const count = TODAY_INDEX + 1 + ahead;
  const keys = MONTHS.slice(0, count);
  const money = (minor: number) => formatAmount(minor, CURRENCY, locale);
  const months = keys.map((key) => ({
    key,
    label: formatMonth(key, locale),
    tickLabel: formatShortMonth(key, locale),
  }));
  const makeSeries = (id: string, label: string, tone: TrajectorySeries["tone"], all: number[]): TrajectorySeries => {
    const values = all.slice(0, count);
    return { id, label, tone, values, valueLabels: values.map(money) };
  };
  const series = [
    makeSeries("checking", t.checking, "primary", CHECKING),
    makeSeries("savings", t.savings, "secondary", SAVINGS),
  ];
  // In the app this comes from the domain indicator "minimum balance and its
  // date"; the preview stands in with the lowest planned month end.
  const planned = CHECKING.slice(TODAY_INDEX + 1, count);
  const lowestIndex = TODAY_INDEX + 1 + planned.indexOf(Math.min(...planned));
  const lowest = { seriesId: "checking", index: lowestIndex, label: t.lowest(money(CHECKING[lowestIndex] ?? 0)) };

  return (
    <div className="preview" lang={locale}>
      <div className="controls">
        <fieldset className="seg">
          <legend className="sr">Language</legend>
          {(["en", "fr"] as const).map((code) => (
            <label key={code}>
              <input type="radio" name="locale" value={code} checked={locale === code} onChange={() => setLocale(code)} />
              {code === "en" ? "English" : "Français"}
            </label>
          ))}
        </fieldset>
      </div>
      <section className="card" aria-labelledby="trajectory-heading">
        <div className="head">
          <h2 id="trajectory-heading">{t.heading}</h2>
          <fieldset className="seg">
            <legend className="sr">{t.horizon}</legend>
            {HORIZONS.map((value) => (
              <label key={value}>
                <input type="radio" name="horizon" value={value} checked={ahead === value} onChange={() => setAhead(value)} />
                {t.months(value)}
              </label>
            ))}
          </fieldset>
        </div>
        <TrajectoryChart
          label={t.chartLabel}
          hint={t.hint}
          currency={CURRENCY}
          locale={locale}
          months={months}
          todayIndex={TODAY_INDEX}
          series={series}
          lowest={lowest}
          text={t}
        />
        <details>
          <summary>{t.table}</summary>
          <div className="scroll">
            <TrajectoryTable months={months} todayIndex={TODAY_INDEX} series={series} text={t} />
          </div>
        </details>
      </section>
    </div>
  );
}

const container = document.getElementById("root");
if (container === null) throw new Error("The preview needs an element with the id root");
createRoot(container).render(
  <StrictMode>
    <Preview />
  </StrictMode>,
);
