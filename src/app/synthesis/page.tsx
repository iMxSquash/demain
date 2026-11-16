import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getLocale, getTimeZone, getTranslations } from "next-intl/server";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";

import { DataTable, EmptyState } from "../../components/data-display";
import { SkeletonRegion, SkeletonTable } from "../../components/skeleton";
import { formatAmount } from "../../domain/money";
import { monthOf, type Month } from "../../domain/synthesis";
import { formatMonth, todayIn } from "../../i18n/dates";
import { listAccounts } from "../../ledger/accounts";
import { getReferenceCurrency } from "../../ledger/exchange-rates";
import { getMonthlySynthesis } from "../../ledger/synthesis";
import { withDatabase } from "../../storage/with-database";
import { requireSession } from "../auth/session";
import { tagDataRead } from "../data-cache";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("synthesis");
  return { title: t("metaTitle") };
}

const PAGE_GAP = "gap-6";

// The title and the link show at once; the table, whose caption and columns hold the currency and the
// names of the accounts, waits for the database.
export default async function SynthesisPage() {
  const [t, common] = await Promise.all([
    getTranslations("synthesis"),
    getTranslations("common"),
  ]);

  return (
    <main className={`mx-auto flex max-w-6xl flex-col ${PAGE_GAP} p-8`}>
      <Link href="/" className="self-start underline">
        {common("backToHome")}
      </Link>
      <h1 className="text-heading font-medium">{t("title")}</h1>
      <Suspense fallback={<SynthesisLoading />}>
        <Synthesis />
      </Suspense>
    </main>
  );
}

function SynthesisLoading() {
  const loading = useTranslations("loading");

  return (
    <SkeletonRegion label={loading("table")} className={`flex flex-col ${PAGE_GAP}`}>
      <SkeletonTable columns={6} rows={6} />
    </SkeletonRegion>
  );
}

// The month is an argument, so the entry of last month is not served once the month changes.
async function readSynthesis(throughMonth: Month) {
  "use cache";
  tagDataRead();
  return withDatabase((db) => {
    const referenceCurrency = getReferenceCurrency(db);
    return {
      accounts: listAccounts(db, { includeArchived: true }),
      months: getMonthlySynthesis(db, { referenceCurrency, throughMonth }),
      referenceCurrency,
    };
  });
}

async function Synthesis() {
  await requireSession();
  // The page reads the database and the clock: it must run per request.
  await connection();
  const [t, locale, timeZone] = await Promise.all([
    getTranslations("synthesis"),
    getLocale(),
    getTimeZone(),
  ]);
  const throughMonth = monthOf(todayIn(timeZone, new Date()));
  const { accounts, months, referenceCurrency } = await readSynthesis(throughMonth);
  const money = (minorUnits: number, currency = referenceCurrency) =>
    formatAmount(minorUnits, currency, locale);
  const unconverted = [
    ...new Set(months.flatMap((month) => month.unconvertedCurrencies)),
  ].sort();

  return (
    <>
    {unconverted.length > 0 ? (
      <p role="status">
        {t("unconverted", { currencies: unconverted.join(", ") })}
      </p>
    ) : null}

    {months.length === 0 ? (
      <EmptyState>
        {t.rich("empty", {
          link: (chunks) => (
            <Link href="/accounts" className="underline">
              {chunks}
            </Link>
          ),
        })}
      </EmptyState>
    ) : (
      <DataTable
        caption={t("caption", { currency: referenceCurrency })}
        regionLabel={t("regionLabel")}
      >
        <thead>
          <tr>
            <th scope="col">{t("columns.month")}</th>
            <th scope="col" className="text-right">{t("columns.net")}</th>
            <th scope="col" className="text-right">{t("columns.savings")}</th>
            <th scope="col" className="text-right">{t("columns.cumulativeSavings")}</th>
            <th scope="col" className="text-right">{t("columns.cumulativeAccount")}</th>
            {accounts.map((account) => (
              <th key={account.id} scope="col" className="text-right">
                {account.name}
                {account.archived ? ` ${t("archivedSuffix")}` : ""}
              </th>
            ))}
            <th scope="col" className="text-right">{t("columns.total")}</th>
          </tr>
        </thead>
        <tbody>
          {months.map((month) => {
            const balanceOf = new Map(
              month.balances.map((entry) => [entry.accountId, entry]),
            );
            return (
              <tr key={month.month}>
                <th scope="row" className="tabular-nums">
                  <time dateTime={month.month}>
                    {formatMonth(month.month, locale)}
                  </time>
                </th>
                <td className="text-right">{money(month.net)}</td>
                <td className="text-right">{money(month.savings)}</td>
                <td className="text-right">
                  {money(month.cumulativeSavings)}
                </td>
                <td className="text-right">
                  {money(month.cumulativeAccount)}
                </td>
                {accounts.map((account) => {
                  const entry = balanceOf.get(account.id);
                  return (
                    <td key={account.id} className="text-right">
                      {entry === undefined
                        ? ""
                        : money(entry.balance, entry.currency)}
                    </td>
                  );
                })}
                <td className="text-right font-medium">
                  {money(month.total)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </DataTable>
    )}
    </>
  );
}
