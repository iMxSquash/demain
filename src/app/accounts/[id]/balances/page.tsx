import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTimeZone, getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { cache, Suspense } from "react";

import { EmptyState } from "../../../../components/data-display";
import { PageSection } from "../../../../components/page-section";
import {
  SkeletonFields,
  SkeletonLine,
  SkeletonRegion,
  SkeletonTable,
} from "../../../../components/skeleton";
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

type AccountParams = Promise<{ id: string }>;

// One read for the whole request: every part below passes the same `params` and gets the same answer.
const readAccountBalances = cache(async (params: AccountParams) => {
  // Checked here, inside the `Suspense` of each part, so the page awaits nothing and its static parts
  // are part of the prefetched App Shell (ADR-023). The id comes from the URL, which the shared App
  // Shell cannot hold either.
  await requireSession();
  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isSafeInteger(id)) notFound();
  // The page reads the database and the clock: it must run per request.
  await connection();
  try {
    return withDatabase((db) => {
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
});

// The back link, the intro and the headings show at once; the title (the name of the account), the
// form and the table wait for the database, each on its own.
export default async function BalanceAssertionsPage({
  params,
}: {
  params: AccountParams;
}) {
  const [t, accountsT] = await Promise.all([
    getTranslations("balances"),
    getTranslations("accounts"),
  ]);

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-8 p-8">
      <Link href="/accounts" className="self-start underline">
        {accountsT("backToAccounts")}
      </Link>
      <Suspense fallback={<SkeletonLine size="heading" width="1/3" />}>
        <AccountTitle params={params} />
      </Suspense>
      <p>{t("intro")}</p>

      <Suspense fallback={<NewAssertionLoading />}>
        <NewAssertion params={params} />
      </Suspense>

      <PageSection id="list-heading" heading={t("listHeading")}>
        <Suspense fallback={<AssertionListLoading />}>
          <AssertionList params={params} />
        </Suspense>
      </PageSection>
    </main>
  );
}

async function AccountTitle({ params }: { params: AccountParams }) {
  const [t, { account }] = await Promise.all([
    getTranslations("balances"),
    readAccountBalances(params),
  ]);

  return <h1 className="text-heading font-medium">{t("title", { name: account.name })}</h1>;
}

function NewAssertionLoading() {
  const t = useTranslations("balances");
  const loading = useTranslations("loading");

  return (
    <SkeletonRegion label={loading("form")}>
      <PageSection id="new-heading" heading={t("addHeading")}>
        <SkeletonFields count={4} />
      </PageSection>
    </SkeletonRegion>
  );
}

async function NewAssertion({ params }: { params: AccountParams }) {
  const [t, timeZone, { account }] = await Promise.all([
    getTranslations("balances"),
    getTimeZone(),
    readAccountBalances(params),
  ]);

  if (account.archived) return <p>{t("archivedNote")}</p>;
  return (
    <PageSection id="new-heading" heading={t("addHeading")}>
      <BalanceAssertionForm
        action={saveBalanceAssertionAction.bind(null, account.id)}
        initialValues={{
          accountId: "",
          date: todayIn(timeZone, new Date()),
          amount: "",
          note: "",
        }}
      />
    </PageSection>
  );
}

// The caption names the account, so the whole table is drawn as blocks.
function AssertionListLoading() {
  const loading = useTranslations("loading");

  return (
    <SkeletonRegion label={loading("table")}>
      <SkeletonTable columns={6} rows={3} />
    </SkeletonRegion>
  );
}

async function AssertionList({ params }: { params: AccountParams }) {
  const [t, { account, assertions }] = await Promise.all([
    getTranslations("balances"),
    readAccountBalances(params),
  ]);

  if (assertions.length === 0) {
    return (
      <EmptyState
        action={
          account.archived ? undefined : { href: "#new-heading", label: t("emptyAction") }
        }
      >
        {t("empty")}
      </EmptyState>
    );
  }
  return (
    <BalanceAssertionsTable
      assertions={assertions}
      caption={t("caption", { name: account.name })}
      showAccount={false}
    />
  );
}
