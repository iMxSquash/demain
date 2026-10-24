import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { connection } from "next/server";

import { listAccounts } from "../../ledger/accounts";
import { withDatabase } from "../../storage/with-database";
import { ImportForm } from "./import-form";
import { requireSession } from "../auth/session";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("imports");
  return { title: t("metaTitle") };
}

export default async function ImportsPage() {
  await requireSession();
  // The page reads the database: it must run per request, never at build time.
  await connection();
  const [t, common] = await Promise.all([
    getTranslations("imports"),
    getTranslations("common"),
  ]);
  const accounts = withDatabase((db) => listAccounts(db));

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 p-8">
      <Link href="/" className="self-start underline">
        {common("backToHome")}
      </Link>
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="max-w-prose">{t("intro")}</p>
      {accounts.length === 0 ? (
        <p>{t("noAccount")}</p>
      ) : (
        <ImportForm
          accounts={accounts.map((account) => ({
            id: account.id,
            name: account.name,
          }))}
        />
      )}
    </main>
  );
}
