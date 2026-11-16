import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTimeZone, getTranslations } from "next-intl/server";
import Link from "next/link";
import { connection } from "next/server";
import { cache, Suspense } from "react";

import { EmptyState } from "../../components/data-display";
import { PageSection } from "../../components/page-section";
import {
  SkeletonDataTable,
  SkeletonFields,
  SkeletonRegion,
} from "../../components/skeleton";
import { todayIn } from "../../i18n/dates";
import { listAccounts } from "../../ledger/accounts";
import { listAllBalanceAssertions } from "../../ledger/balance-assertions";
import { withDatabase } from "../../storage/with-database";
import { requireSession } from "../auth/session";
import { saveBalanceAssertionForChosenAccountAction } from "../accounts/[id]/balances/actions";
import { BalanceAssertionForm } from "../accounts/[id]/balances/balance-assertion-form";
import { BalanceAssertionsHead, BalanceAssertionsTable } from "./balance-assertions-table";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("balances");
  return { title: t("allMetaTitle") };
}

// One read for the whole request: both sections ask for it and get the same answer.
const readBalances = cache(async () => {
  // The page reads the database: it must run per request.
  await connection();
  return withDatabase((db) => ({
    assertions: listAllBalanceAssertions(db),
    activeAccounts: listAccounts(db),
  }));
});

// The sections show their heading at once and hold only the data in a `Suspense`, so a slow read
// never delays the rest of the page.
export default async function AllBalanceAssertionsPage() {
  await requireSession();
  const [t, common] = await Promise.all([
    getTranslations("balances"),
    getTranslations("common"),
  ]);

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

      <PageSection id="new-heading" heading={t("addHeading")}>
        <Suspense fallback={<AssertionFormLoading />}>
          <NewAssertion />
        </Suspense>
      </PageSection>

      <PageSection id="list-heading" heading={t("listHeading")}>
        <Suspense fallback={<AssertionListLoading />}>
          <AssertionList />
        </Suspense>
      </PageSection>
    </main>
  );
}

function AssertionFormLoading() {
  const loading = useTranslations("loading");

  return (
    <SkeletonRegion label={loading("form")}>
      <SkeletonFields count={4} />
    </SkeletonRegion>
  );
}

async function NewAssertion() {
  const [t, timeZone, { activeAccounts }] = await Promise.all([
    getTranslations("balances"),
    getTimeZone(),
    readBalances(),
  ]);

  if (activeAccounts.length === 0) {
    return (
      <p>
        <Link href="/accounts" className="underline">
          {t("accountsLink")}
        </Link>
      </p>
    );
  }
  return (
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
  );
}

function AssertionListLoading() {
  const t = useTranslations("balances");
  const loading = useTranslations("loading");

  return (
    <SkeletonRegion label={loading("table")}>
      <SkeletonDataTable
        caption={t("allCaption")}
        regionLabel={t("regionLabel")}
        head={<BalanceAssertionsHead showAccount />}
        columns={["start", "start", "end", "end", "start", "start", "start"]}
        rows={3}
      />
    </SkeletonRegion>
  );
}

async function AssertionList() {
  const [t, { assertions, activeAccounts }] = await Promise.all([
    getTranslations("balances"),
    readBalances(),
  ]);

  if (assertions.length === 0) {
    // Without an active account the page shows no form to point at.
    if (activeAccounts.length === 0) {
      return <EmptyState>{t("allEmptyNoAccount")}</EmptyState>;
    }
    return (
      <EmptyState action={{ href: "#new-heading", label: t("emptyAction") }}>
        {t("allEmpty")}
      </EmptyState>
    );
  }
  return (
    <BalanceAssertionsTable
      assertions={assertions}
      caption={t("allCaption")}
      showAccount
    />
  );
}
