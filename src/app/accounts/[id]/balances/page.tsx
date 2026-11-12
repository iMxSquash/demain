import type { Metadata } from "next";
import { getTimeZone, getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { todayIn } from "../../../../i18n/dates";
import { AccountNotFoundError, getAccount } from "../../../../ledger/accounts";
import { listBalanceAssertions } from "../../../../ledger/balance-assertions";
import { withDatabase } from "../../../../storage/with-database";
import { requireSession } from "../../../auth/session";
import { BalanceAssertionsTable } from "../../../balances/balance-assertions-table";
import { saveBalanceAssertionAction } from "./actions";
import { BalanceAssertionForm } from "./balance-assertion-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("balances");
  return { title: t("metaTitle") };
}

export default async function BalanceAssertionsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireSession();
  // The page reads the database and the clock: it must run per request.
  await connection();
  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isSafeInteger(id)) notFound();

  const [t, accountsT, timeZone] = await Promise.all([
    getTranslations("balances"),
    getTranslations("accounts"),
    getTimeZone(),
  ]);

  let data;
  try {
    data = withDatabase((db) => {
      const account = getAccount(db, id);
      return {
        account,
        assertions: listBalanceAssertions(db, id).map((assertion) => ({
          ...assertion,
          accountName: account.name,
          accountCurrency: account.currency,
          accountArchived: account.archived,
        })),
      };
    });
  } catch (error) {
    if (error instanceof AccountNotFoundError) notFound();
    throw error;
  }
  const { account, assertions } = data;

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-8 p-8">
      <Link href="/accounts" className="self-start underline">
        {accountsT("backToAccounts")}
      </Link>
      <h1 className="text-heading font-medium">
        {t("title", { name: account.name })}
      </h1>
      <p>{t("intro")}</p>

      {account.archived ? (
        <p>{t("archivedNote")}</p>
      ) : (
        <section aria-labelledby="new-heading" className="flex flex-col gap-3">
          <h2 id="new-heading" className="text-title font-medium">
            {t("addHeading")}
          </h2>
          <BalanceAssertionForm
            action={saveBalanceAssertionAction.bind(null, account.id)}
            initialValues={{
              accountId: "",
              date: todayIn(timeZone, new Date()),
              amount: "",
              note: "",
            }}
          />
        </section>
      )}

      <section aria-labelledby="list-heading" className="flex flex-col gap-3">
        <h2 id="list-heading" className="text-title font-medium">
          {t("listHeading")}
        </h2>
        {assertions.length === 0 ? (
          <p>{t("empty")}</p>
        ) : (
          <BalanceAssertionsTable
            assertions={assertions}
            caption={t("caption", { name: account.name })}
            showAccount={false}
          />
        )}
      </section>
    </main>
  );
}
