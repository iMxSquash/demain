import type { Metadata } from "next";
import { getLocale, getTimeZone, getTranslations } from "next-intl/server";
import Link from "next/link";
import { connection } from "next/server";

import { formatRate } from "../../domain/exchange-rate";
import { todayIn } from "../../i18n/dates";
import {
  getReferenceCurrency,
  isEcbFetchEnabled,
  listExchangeRates,
} from "../../ledger/exchange-rates";
import { withDatabase } from "../../storage/with-database";
import { requireSession } from "../auth/session";
import { DataTable, EmptyState } from "../../components/data-display";
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

export default async function CurrenciesPage() {
  await requireSession();
  // The page reads the database and the clock: it must run per request.
  await connection();
  const [t, common, locale, timeZone] = await Promise.all([
    getTranslations("currencies"),
    getTranslations("common"),
    getLocale(),
    getTimeZone(),
  ]);
  const { referenceCurrency, rates, isEcbEnabled } = withDatabase((db) => ({
    referenceCurrency: getReferenceCurrency(db),
    rates: listExchangeRates(db),
    isEcbEnabled: isEcbFetchEnabled(db),
  }));

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-8 p-8">
      <Link href="/" className="self-start underline">
        {common("backToHome")}
      </Link>
      <h1 className="text-heading font-medium">{t("title")}</h1>

      <section aria-labelledby="reference-heading" className="flex flex-col gap-3">
        <h2 id="reference-heading" className="text-title font-medium">
          {t("referenceHeading")}
        </h2>
        <p>{t("referenceIntro")}</p>
        <ReferenceCurrencyForm
          action={saveReferenceCurrencyAction}
          currentCurrency={referenceCurrency}
        />
      </section>

      <section aria-labelledby="new-heading" className="flex flex-col gap-3">
        <h2 id="new-heading" className="text-title font-medium">
          {t("ratesHeading")}
        </h2>
        <p>{t("ratesIntro")}</p>
        <h3 className="text-title font-medium">{t("addRateHeading")}</h3>
        <RateForm
          action={saveExchangeRateAction}
          initialValues={{
            date: todayIn(timeZone, new Date()),
            base: referenceCurrency,
            quote: "",
            rate: "",
          }}
        />
      </section>

      <section aria-labelledby="list-heading" className="flex flex-col gap-3">
        <h2 id="list-heading" className="text-title font-medium">
          {t("listHeading")}
        </h2>
        {rates.length === 0 ? (
          <EmptyState action={{ href: "#new-heading", label: t("emptyAction") }}>
            {t("empty")}
          </EmptyState>
        ) : (
          <DataTable caption={t("caption")}>
            <thead>
              <tr>
                <th scope="col">{t("columns.date")}</th>
                <th scope="col">{t("columns.pair")}</th>
                <th scope="col" className="text-right">{t("columns.rate")}</th>
                <th scope="col">{t("columns.source")}</th>
                <th scope="col">{t("columns.actions")}</th>
              </tr>
            </thead>
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
        )}
      </section>

      <section aria-labelledby="ecb-heading" className="flex flex-col gap-3">
        <h2 id="ecb-heading" className="text-title font-medium">
          {t("ecbHeading")}
        </h2>
        <p>{t("ecbIntro")}</p>
        <EcbPanel
          isEnabled={isEcbEnabled}
          setEnabled={setEcbFetchEnabledAction}
          fetchRates={fetchEcbRatesAction}
        />
      </section>
    </main>
  );
}
