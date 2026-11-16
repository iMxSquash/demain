import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";

import { SkeletonFields, SkeletonRegion } from "../../components/skeleton";
import { listAccounts, listOverflowAccounts } from "../../ledger/accounts";
import { readAssertionLinkSnapshot } from "../../ledger/balance-assertions";
import { listCategories } from "../../ledger/categories";
import { withDatabase } from "../../storage/with-database";
import { requireSession } from "../auth/session";
import { tagDataRead } from "../data-cache";
import { toImportView } from "./import-form-data";
import { ImportForm } from "./import-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("imports");
  return { title: t("metaTitle") };
}

export default async function ImportsPage() {
  await requireSession();
  const [t, common] = await Promise.all([
    getTranslations("imports"),
    getTranslations("common"),
  ]);

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 p-8">
      <Link href="/" className="self-start underline">
        {common("backToHome")}
      </Link>
      <h1 className="text-heading font-medium">{t("title")}</h1>
      <p className="max-w-prose">{t("intro")}</p>
      <Suspense fallback={<ImportFormLoading />}>
        <ImportSection />
      </Suspense>
    </main>
  );
}

function ImportFormLoading() {
  const loading = useTranslations("loading");

  return (
    <SkeletonRegion label={loading("form")}>
      <SkeletonFields count={2} />
    </SkeletonRegion>
  );
}

async function readImportContext() {
  "use cache";
  tagDataRead();
  return withDatabase((db) => ({
    view: toImportView(listAccounts(db), listCategories(db), listOverflowAccounts(db)),
    assertionSnapshot: readAssertionLinkSnapshot(db),
  }));
}

async function ImportSection() {
  // The page reads the database: it must run per request, never at build time.
  await connection();
  const t = await getTranslations("imports");
  const { view, assertionSnapshot } = await readImportContext();

  if (view.accounts.length === 0) return <p>{t("noAccount")}</p>;
  return <ImportForm {...view} assertionSnapshot={assertionSnapshot} />;
}
