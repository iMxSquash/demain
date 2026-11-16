import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getLocale, getTimeZone, getTranslations } from "next-intl/server";
import Link from "next/link";
import { connection } from "next/server";
import { cache, Suspense } from "react";

import { formatRate } from "../../domain/exchange-rate";
import { todayIn } from "../../i18n/dates";
import {
  getReferenceCurrency,
  isEcbFetchEnabled,
  listExchangeRates,
} from "../../ledger/exchange-rates";
import { withDatabase } from "../../storage/with-database";
import { requireSession } from "../auth/session";
import { tagDataRead } from "../data-cache";
import { DataTable, EmptyState } from "../../components/data-display";
import { PageSection } from "../../components/page-section";
import {
  SkeletonBlock,
  SkeletonDataTable,
  SkeletonFields,
  SkeletonLine,
  SkeletonRegion,
} from "../../components/skeleton";
import { ConfirmActionButton } from "../confirm-action-button";
import {
  deleteExchangeRateAction,
  fetchEcbRatesAction,
  saveExchangeRateAction,
  saveReferenceCurrencyAction,
  setEcbFetchEnabledAction,
} from "./actions";
import { EcbPanel } from "./ecb-panel";
import { RateForm } from "./rate-form";
import { ReferenceCurrencyForm } from "./reference-currency-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("currencies");
  return { title: t("metaTitle") };
}

// One read for the whole request: every section below asks for it and gets the same answer.
const readCurrencies = cache(async () => {
  // Inside the `Suspense` of each section, so the page itself joins the prefetched App Shell (ADR-023).
  await requireSession();
  // The page reads the database and the clock: it must run per request.
  await connection();
  return readCurrenciesFromDatabase();
});

async function readCurrenciesFromDatabase() {
  "use cache";
  tagDataRead();
  return withDatabase((db) => ({
    referenceCurrency: getReferenceCurrency(db),
    rates: listExchangeRates(db),
    isEcbEnabled: isEcbFetchEnabled(db),
  }));
}

// The sections show their headings and their text at once and hold only the data in a `Suspense`,
// so a slow read never delays the rest of the page.
export default async function CurrenciesPage() {
  const [t, common] = await Promise.all([
    getTranslations("currencies"),
    getTranslations("common"),
  ]);

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-8 p-8">
      <Link href="/" className="self-start underline">
        {common("backToHome")}
      </Link>
      <h1 className="text-heading font-medium">{t("title")}</h1>

      <PageSection id="reference-heading" heading={t("referenceHeading")}>
        <p>{t("referenceIntro")}</p>
        <Suspense fallback={<FormLoading count={1} />}>
          <ReferenceCurrency />
        </Suspense>
      </PageSection>

      <PageSection id="new-heading" heading={t("ratesHeading")}>
        <p>{t("ratesIntro")}</p>
        <h3 className="text-title font-medium">{t("addRateHeading")}</h3>
        <Suspense fallback={<FormLoading count={4} />}>
          <NewRate />
        </Suspense>
      </PageSection>

      <PageSection id="list-heading" heading={t("listHeading")}>
        <Suspense fallback={<RateListLoading />}>
          <RateList />
        </Suspense>
      </PageSection>

      <PageSection id="ecb-heading" heading={t("ecbHeading")}>
        <p>{t("ecbIntro")}</p>
        <Suspense fallback={<EcbLoading />}>
          <Ecb />
        </Suspense>
      </PageSection>
    </main>
  );
}

function FormLoading({ count }: { count: number }) {
  const loading = useTranslations("loading");

  return (
    <SkeletonRegion label={loading("form")}>
      <SkeletonFields count={count} />
    </SkeletonRegion>
  );
}

async function ReferenceCurrency() {
  const { referenceCurrency } = await readCurrencies();

  return (
    <ReferenceCurrencyForm
      action={saveReferenceCurrencyAction}
      currentCurrency={referenceCurrency}
    />
  );
}

async function NewRate() {
  const [timeZone, { referenceCurrency }] = await Promise.all([
    getTimeZone(),
    readCurrencies(),
  ]);

  return (
    <RateForm
      action={saveExchangeRateAction}
      initialValues={{
        date: todayIn(timeZone, new Date()),
        base: referenceCurrency,
        quote: "",
        rate: "",
      }}
    />
  );
}

// The same `thead` for the loaded table and for its skeleton.
function RatesHead() {
  const t = useTranslations("currencies");

  return (
    <thead>
      <tr>
        <th scope="col">{t("columns.date")}</th>
        <th scope="col">{t("columns.pair")}</th>
        <th scope="col" className="text-right">{t("columns.rate")}</th>
        <th scope="col">{t("columns.source")}</th>
        <th scope="col">{t("columns.actions")}</th>
      </tr>
    </thead>
  );
}

function RateListLoading() {
  const t = useTranslations("currencies");
  const loading = useTranslations("loading");

  return (
    <SkeletonRegion label={loading("table")}>
      <SkeletonDataTable
        caption={t("caption")}
        regionLabel={t("regionLabel")}
        head={<RatesHead />}
        columns={["start", "start", "end", "start", "start"]}
        rows={3}
      />
    </SkeletonRegion>
  );
}

async function RateList() {
  const [t, locale, { rates }] = await Promise.all([
    getTranslations("currencies"),
    getLocale(),
    readCurrencies(),
  ]);

  if (rates.length === 0) {
    return (
      <EmptyState action={{ href: "#new-heading", label: t("emptyAction") }}>
        {t("empty")}
      </EmptyState>
    );
  }

  return (
    <DataTable caption={t("caption")} regionLabel={t("regionLabel")}>
      <RatesHead />
      <tbody>
      {rates.map((rate) => {
        const pair = `${rate.base}/${rate.quote}`;
        return (
          <tr key={rate.id}>
            <th scope="row" className="tabular-nums">
              <time dateTime={rate.date}>{rate.date}</time>
            </th>
            <td>{pair}</td>
            <td className="text-right">{formatRate(rate.rate, locale)}</td>
            <td>
              {rate.source === "ecb" ? t("sourceEcb") : t("sourceManual")}
            </td>
            <td>
              <ConfirmActionButton
                action={deleteExchangeRateAction.bind(null, rate.id)}
                label={t("delete")}
                subject={`${pair} ${rate.date}`}
                title={t("deleteTitle", { pair, date: rate.date })}
                message={t("deleteMessage")}
                confirmLabel={t("deleteConfirm")}
              />
            </td>
          </tr>
        );
      })}
      </tbody>
    </DataTable>
  );
}

// A line saying whether the daily fetch is on, and the button that changes it.
function EcbLoading() {
  const loading = useTranslations("loading");

  return (
    <SkeletonRegion label={loading("form")} className="flex flex-col gap-4">
      <SkeletonLine width="1/2" />
      <SkeletonBlock className="h-11 w-48 rounded-pill" />
    </SkeletonRegion>
  );
}

async function Ecb() {
  const { isEcbEnabled } = await readCurrencies();

  return (
    <EcbPanel
      isEnabled={isEcbEnabled}
      setEnabled={setEcbFetchEnabledAction}
      fetchRates={fetchEcbRatesAction}
    />
  );
}
