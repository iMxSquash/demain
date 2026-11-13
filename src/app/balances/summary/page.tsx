import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { connection } from "next/server";

import { listAccounts } from "../../../ledger/accounts";
import { withDatabase } from "../../../storage/with-database";
import { requireSession } from "../../auth/session";
import { SummaryBalancesForm } from "./summary-balances-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("summaryBalances");
  return { title: t("metaTitle") };
}

export default async function SummaryBalancesPage() {
  await requireSession();
  // The page reads the database: it must run per request, never at build time.
  await connection();
  const t = await getTranslations("summaryBalances");
  const accounts = withDatabase((db) => listAccounts(db));

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 p-8">
      <Link href="/balances" className="self-start underline">
        {t("backToBalances")}
      </Link>
      <h1 className="text-heading font-medium">{t("title")}</h1>
      <p className="max-w-prose">{t("intro")}</p>
      {accounts.length === 0 ? (
        <p>{t("noAccount")}</p>
      ) : (
        <SummaryBalancesForm
          accounts={accounts.map(({ id, name }) => ({ id, name }))}
        />
      )}
    </main>
  );
}
