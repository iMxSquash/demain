import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";

import { SkeletonFields, SkeletonRegion } from "../../../components/skeleton";
import { listAccounts } from "../../../ledger/accounts";
import { withDatabase } from "../../../storage/with-database";
import { requireSession } from "../../auth/session";
import { tagDataRead } from "../../data-cache";
import { SummaryBalancesForm } from "./summary-balances-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("summaryBalances");
  return { title: t("metaTitle") };
}

export default async function SummaryBalancesPage() {
  await requireSession();
  const t = await getTranslations("summaryBalances");

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 p-8">
      <Link href="/balances" className="self-start underline">
        {t("backToBalances")}
      </Link>
      <h1 className="text-heading font-medium">{t("title")}</h1>
      <p className="max-w-prose">{t("intro")}</p>
      <Suspense fallback={<SummaryFormLoading />}>
        <SummaryForm />
      </Suspense>
    </main>
  );
}

function SummaryFormLoading() {
  const loading = useTranslations("loading");

  return (
    <SkeletonRegion label={loading("form")}>
      <SkeletonFields count={3} />
    </SkeletonRegion>
  );
}

async function readActiveAccounts() {
  "use cache";
  tagDataRead();
  return withDatabase(listAccounts);
}

async function SummaryForm() {
  // The page reads the database: it must run per request, never at build time.
  await connection();
  const t = await getTranslations("summaryBalances");
  const accounts = await readActiveAccounts();

  if (accounts.length === 0) return <p>{t("noAccount")}</p>;
  return (
    <SummaryBalancesForm accounts={accounts.map(({ id, name }) => ({ id, name }))} />
  );
}
