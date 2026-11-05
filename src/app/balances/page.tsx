import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { connection } from "next/server";

import { listAllBalanceAssertions } from "../../ledger/balance-assertions";
import { withDatabase } from "../../storage/with-database";
import { requireSession } from "../auth/session";
import { BalanceAssertionsTable } from "./balance-assertions-table";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("balances");
  return { title: t("allMetaTitle") };
}

export default async function AllBalanceAssertionsPage() {
  await requireSession();
  // The page reads the database: it must run per request.
  await connection();
  const [t, common] = await Promise.all([
    getTranslations("balances"),
    getTranslations("common"),
  ]);
  const assertions = withDatabase(listAllBalanceAssertions);

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-8 p-8">
      <Link href="/" className="self-start underline">
        {common("backToHome")}
      </Link>
      <h1 className="text-2xl font-semibold">{t("allTitle")}</h1>
      <p>{t("allIntro")}</p>
      <Link href="/accounts" className="self-start underline">
        {t("accountsLink")}
      </Link>

      <section aria-labelledby="list-heading" className="flex flex-col gap-3">
        <h2 id="list-heading" className="text-xl font-semibold">
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
