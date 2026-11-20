import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getLocale, getTimeZone, getTranslations } from "next-intl/server";
import Link from "next/link";
import { connection } from "next/server";
import { cache, Suspense } from "react";

import { DataTable, EmptyState } from "../../components/data-display";
import { PageSection } from "../../components/page-section";
import {
  SkeletonDataTable,
  SkeletonFields,
  SkeletonRegion,
} from "../../components/skeleton";
import { formatAmount } from "../../domain/money";
import {
  DEFAULT_AVERAGE_WINDOW,
  DEFAULT_MATCH_AMOUNT_TOLERANCE_BP,
  DEFAULT_MATCH_WINDOW_DAYS,
  formatTolerancePercent,
  versionInEffectAt,
} from "../../domain/planned-item";
import { todayIn } from "../../i18n/dates";
import { listAccounts } from "../../ledger/accounts";
import { listCategories } from "../../ledger/categories";
import { listPlannedItems } from "../../ledger/planned-items";
import { withDatabase } from "../../storage/with-database";
import { requireSession } from "../auth/session";
import { tagDataRead } from "../data-cache";
import { createPlannedItemAction } from "./actions";
import { DEFAULT_AMOUNT_MODE, DEFAULT_FORM_KIND, DEFAULT_REPETITION } from "./planned-item-form-data";
import { PlannedItemForm } from "./planned-item-form";
import { accountTextOf, scheduleText } from "./planned-item-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("planned");
  return { title: t("metaTitle") };
}

const NEW_PLANNED_ITEM_DEFAULTS = {
  name: "",
  kind: DEFAULT_FORM_KIND,
  accountId: "",
  destinationAccountId: "",
  categoryId: "",
  startDate: "",
  endDate: "",
  repetition: DEFAULT_REPETITION,
  repetitionValue: "",
  businessDayRule: "none",
  amount: "",
  amountMode: DEFAULT_AMOUNT_MODE,
  averageWindow: String(DEFAULT_AVERAGE_WINDOW),
  acceptsMultipleTransactions: "",
  provisionLabelFilter: "",
  matchWindowDays: String(DEFAULT_MATCH_WINDOW_DAYS),
  matchTolerancePercent: formatTolerancePercent(DEFAULT_MATCH_AMOUNT_TOLERANCE_BP),
};

// One read for the whole request: every section below asks for it and gets the same answer.
const readPlanned = cache(async () => {
  // Inside the `Suspense` of each section, so the page itself joins the prefetched App Shell (ADR-023).
  await requireSession();
  // The page reads the database: it must run per request, never at build time.
  await connection();
  return readPlannedFromDatabase();
});

async function readPlannedFromDatabase() {
  "use cache";
  tagDataRead();
  return withDatabase((db) => ({
    items: listPlannedItems(db, { includeCancelled: false }),
    accounts: listAccounts(db, { includeArchived: true }),
    categories: listCategories(db),
  }));
}

// The sections show their heading at once and hold only the data in a `Suspense`, so a slow read
// never delays the rest of the page.
export default async function PlannedPage() {
  const t = await getTranslations("planned");

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-10 p-8">
      <h1 className="text-heading font-medium">{t("title")}</h1>

      <PageSection id="list-heading" heading={t("listHeading")}>
        <Suspense fallback={<PlannedListLoading />}>
          <PlannedList />
        </Suspense>
      </PageSection>

      <PageSection id="new-heading" heading={t("addHeading")}>
        <Suspense fallback={<NewPlannedItemLoading />}>
          <NewPlannedItem />
        </Suspense>
      </PageSection>
    </main>
  );
}

// Shared with the skeleton, so the column headings cannot drift apart.
function PlannedHead() {
  const t = useTranslations("planned");
  const common = useTranslations("common");

  return (
    <thead>
      <tr>
        <th scope="col">{t("columns.name")}</th>
        <th scope="col">{t("columns.kind")}</th>
        <th scope="col">{t("columns.schedule")}</th>
        <th scope="col">{t("columns.account")}</th>
        <th scope="col" className="text-right">{t("columns.amount")}</th>
        <th scope="col">{common("actions")}</th>
      </tr>
    </thead>
  );
}

function PlannedListLoading() {
  const t = useTranslations("planned");
  const loading = useTranslations("loading");

  return (
    <SkeletonRegion label={loading("table")}>
      <SkeletonDataTable
        caption={t("listCaption")}
        head={<PlannedHead />}
        columns={["start", "start", "start", "start", "end", "start"]}
        rows={3}
      />
    </SkeletonRegion>
  );
}

async function PlannedList() {
  const [t, locale, timeZone, { items, accounts }] = await Promise.all([
    getTranslations("planned"),
    getLocale(),
    getTimeZone(),
    readPlanned(),
  ]);
  // Read here, never in the cached read: a cached "today" would go stale.
  const today = todayIn(timeZone, new Date());

  if (items.length === 0) {
    return (
      <EmptyState action={{ href: "#new-heading", label: t("emptyAction") }}>{t("empty")}</EmptyState>
    );
  }

  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const accountNames = new Map(accounts.map((account) => [account.id, account.name]));

  return (
    <DataTable caption={t("listCaption")}>
      <PlannedHead />
      <tbody>
        {items.map((item) => (
          <tr key={item.id}>
            <th scope="row">{item.name}</th>
            <td>{t(`kinds.${item.kind}`)}</td>
            <td>{scheduleText((key, values) => t(key, values), locale, item, today)}</td>
            <td>{accountTextOf(item, accountNames, (names) => t("transferAccounts", names))}</td>
            <td className="text-right">
              {formatAmount(
                versionInEffectAt(item.versions, today).amount,
                accountById.get(item.accountId)?.currency ?? "",
                locale,
              )}
            </td>
            <td>
              <Link
                href={`/planned/${item.id}/edit`}
                className="inline-flex min-h-11 min-w-11 items-center justify-center px-2 underline"
              >
                {t("edit")}
                <span className="sr-only"> {item.name}</span>
              </Link>
            </td>
          </tr>
        ))}
      </tbody>
    </DataTable>
  );
}

function NewPlannedItemLoading() {
  const loading = useTranslations("loading");

  return (
    <SkeletonRegion label={loading("form")}>
      <SkeletonFields count={8} />
    </SkeletonRegion>
  );
}

async function NewPlannedItem() {
  const [t, { accounts, categories }] = await Promise.all([
    getTranslations("planned"),
    readPlanned(),
  ]);
  const activeAccounts = accounts.filter((account) => !account.archived);

  if (activeAccounts.length === 0) {
    return (
      <EmptyState action={{ href: "/accounts", label: t("noAccountAction") }}>
        {t("noAccount")}
      </EmptyState>
    );
  }
  return (
    <PlannedItemForm
      action={createPlannedItemAction}
      initialValues={NEW_PLANNED_ITEM_DEFAULTS}
      accounts={activeAccounts}
      categories={categories}
    />
  );
}
