import type { Metadata } from "next";
import { getTimeZone, getTranslations } from "next-intl/server";
import Link from "next/link";
import { connection } from "next/server";

import { todayIn } from "../../i18n/dates";
import { listAccounts } from "../../ledger/accounts";
import { listAllBalanceAssertions } from "../../ledger/balance-assertions";
import { withDatabase } from "../../storage/with-database";
import { requireSession } from "../auth/session";
import { saveBalanceAssertionForChosenAccountAction } from "../accounts/[id]/balances/actions";
import { BalanceAssertionForm } from "../accounts/[id]/balances/balance-assertion-form";
import { BalanceAssertionsTable } from "./balance-assertions-table";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("balances");
  return { title: t("allMetaTitle") };
}

export default async function AllBalanceAssertionsPage() {
  await requireSession();
  // The page reads the database: it must run per request.
  await connection();
  const [t, common, timeZone] = await Promise.all([
    getTranslations("balances"),
    getTranslations("common"),
    getTimeZone(),
  ]);
  const { assertions, activeAccounts } = withDatabase((db) => ({
    assertions: listAllBalanceAssertions(db),
    activeAccounts: listAccounts(db),
  }));

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-8 p-8">
      <Link href="/" className="self-start underline">
        {common("backToHome")}
      </Link>
      <h1 className="text-heading font-medium">{t("allTitle")}</h1>
      <p>{t("allIntro")}</p>
      <p>
        <Link href="/balances/summary" className="underline">
          {t("summaryLink")}
        </Link>
      </p>

      <section aria-labelledby="new-heading" className="flex flex-col gap-3">
        <h2 id="new-heading" className="text-title font-medium">
          {t("addHeading")}
        </h2>
        {activeAccounts.length === 0 ? (
          <p>
            <Link href="/accounts" className="underline">
              {t("accountsLink")}
            </Link>
          </p>
        ) : (
          <BalanceAssertionForm
            action={saveBalanceAssertionForChosenAccountAction}
            accounts={activeAccounts}
            initialValues={{
              accountId: "",
              date: todayIn(timeZone, new Date()),
              amount: "",
              note: "",
            }}
          />
        )}
      </section>

      <section aria-labelledby="list-heading" className="flex flex-col gap-3">
        <h2 id="list-heading" className="text-title font-medium">
          {t("listHeading")}
        </h2>
        {assertions.length === 0 ? (
          <p>{t("allEmpty")}</p>
        ) : (
          <BalanceAssertionsTable
            assertions={assertions}
            caption={t("allCaption")}
            showAccount
          />
        )}
      </section>
    </main>
  );
}
