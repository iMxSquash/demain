import type { Metadata } from "next";
import { getLocale, getTimeZone, getTranslations } from "next-intl/server";
import Link from "next/link";
import { connection } from "next/server";

import { formatAmount } from "../../domain/money";
import { monthOf } from "../../domain/synthesis";
import { formatMonth, todayIn } from "../../i18n/dates";
import { listAccounts } from "../../ledger/accounts";
import { getReferenceCurrency } from "../../ledger/exchange-rates";
import { getMonthlySynthesis } from "../../ledger/synthesis";
import { withDatabase } from "../../storage/with-database";
import { requireSession } from "../auth/session";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("synthesis");
  return { title: t("metaTitle") };
}

const NUMBER_HEADER = "py-2 pr-4 text-right";
const NUMBER_CELL = "py-2 pr-4 text-right tabular-nums";

export default async function SynthesisPage() {
  await requireSession();
  // The page reads the database and the clock: it must run per request.
  await connection();
  const [t, common, locale, timeZone] = await Promise.all([
    getTranslations("synthesis"),
    getTranslations("common"),
    getLocale(),
    getTimeZone(),
  ]);
  const throughMonth = monthOf(todayIn(timeZone, new Date()));
  const { accounts, months, referenceCurrency } = withDatabase((db) => {
    const referenceCurrency = getReferenceCurrency(db);
    return {
      accounts: listAccounts(db, { includeArchived: true }),
      months: getMonthlySynthesis(db, { referenceCurrency, throughMonth }),
      referenceCurrency,
    };
  });
  const money = (minorUnits: number, currency = referenceCurrency) =>
    formatAmount(minorUnits, currency, locale);
  const unconverted = [
    ...new Set(months.flatMap((month) => month.unconvertedCurrencies)),
  ].sort();

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 p-8">
      <Link href="/" className="self-start underline">
        {common("backToHome")}
      </Link>
      <h1 className="text-heading font-medium">{t("title")}</h1>

      {unconverted.length > 0 ? (
        <p role="status">
          {t("unconverted", { currencies: unconverted.join(", ") })}
        </p>
      ) : null}

      {months.length === 0 ? (
        <p>
          {t.rich("empty", {
            link: (chunks) => (
              <Link href="/accounts" className="underline">
                {chunks}
              </Link>
            ),
          })}
        </p>
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
            <caption className="sr-only">
              {t("caption", { currency: referenceCurrency })}
            </caption>
            <thead>
              <tr className="border-b border-border-control">
                <th scope="col" className="py-2 pr-4">{t("columns.month")}</th>
                <th scope="col" className={NUMBER_HEADER}>{t("columns.net")}</th>
                <th scope="col" className={NUMBER_HEADER}>{t("columns.savings")}</th>
                <th scope="col" className={NUMBER_HEADER}>{t("columns.cumulativeSavings")}</th>
                <th scope="col" className={NUMBER_HEADER}>{t("columns.cumulativeAccount")}</th>
                {accounts.map((account) => (
                  <th key={account.id} scope="col" className={NUMBER_HEADER}>
                    {account.name}
                    {account.archived ? ` ${t("archivedSuffix")}` : ""}
                  </th>
                ))}
                <th scope="col" className="py-2 text-right">{t("columns.total")}</th>
              </tr>
            </thead>
            <tbody>
              {months.map((month) => {
                const balanceOf = new Map(
                  month.balances.map((entry) => [entry.accountId, entry]),
                );
                return (
                  <tr key={month.month} className="border-b border-divider">
                    <th scope="row" className="py-2 pr-4 font-medium tabular-nums">
                      <time dateTime={month.month}>
                        {formatMonth(month.month, locale)}
                      </time>
                    </th>
                    <td className={NUMBER_CELL}>{money(month.net)}</td>
                    <td className={NUMBER_CELL}>{money(month.savings)}</td>
                    <td className={NUMBER_CELL}>
                      {money(month.cumulativeSavings)}
                    </td>
                    <td className={NUMBER_CELL}>
                      {money(month.cumulativeAccount)}
                    </td>
                    {accounts.map((account) => {
                      const entry = balanceOf.get(account.id);
                      return (
                        <td key={account.id} className={NUMBER_CELL}>
                          {entry === undefined
                            ? ""
                            : money(entry.balance, entry.currency)}
                        </td>
                      );
                    })}
                    <td className="py-2 text-right font-medium tabular-nums">
                      {money(month.total)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
