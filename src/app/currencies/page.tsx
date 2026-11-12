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

const NUMBER_HEADER = "py-2 pr-4 text-right";
const NUMBER_CELL = "py-2 pr-4 text-right tabular-nums";

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
          <p>{t("empty")}</p>
        ) : (
          // A focusable region: the table is wider than a phone, and keyboard
          // users must be able to scroll it.
          <div
            role="region"
            aria-label={t("regionLabel")}
            tabIndex={0}
            className="overflow-x-auto"
          >
            <table className="w-full border-collapse text-left">
              <caption className="sr-only">{t("caption")}</caption>
              <thead>
                <tr className="border-b border-border-control">
                  <th scope="col" className="py-2 pr-4">{t("columns.date")}</th>
                  <th scope="col" className="py-2 pr-4">{t("columns.pair")}</th>
                  <th scope="col" className={NUMBER_HEADER}>{t("columns.rate")}</th>
                  <th scope="col" className="py-2 pr-4">{t("columns.source")}</th>
                  <th scope="col" className="py-2">{t("columns.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {rates.map((rate) => {
                  const pair = `${rate.base}/${rate.quote}`;
                  return (
                    <tr key={rate.id} className="border-b border-divider">
                      <th scope="row" className="py-2 pr-4 font-medium tabular-nums">
                        <time dateTime={rate.date}>{rate.date}</time>
                      </th>
                      <td className="py-2 pr-4">{pair}</td>
                      <td className={NUMBER_CELL}>{formatRate(rate.rate, locale)}</td>
                      <td className="py-2 pr-4">
                        {rate.source === "ecb" ? t("sourceEcb") : t("sourceManual")}
                      </td>
                      <td className="py-2">
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
            </table>
          </div>
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
