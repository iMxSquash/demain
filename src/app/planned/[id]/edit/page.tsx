import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

import { SkeletonFields, SkeletonLine, SkeletonRegion } from "../../../../components/skeleton";
import { formatAmount } from "../../../../domain/money";
import { formatTolerancePercent } from "../../../../domain/planned-item";
import { formatCalendarDate } from "../../../../i18n/dates";
import { listAccounts } from "../../../../ledger/accounts";
import { listCategories } from "../../../../ledger/categories";
import { getPlannedItem, PlannedItemNotFoundError } from "../../../../ledger/planned-items";
import { withDatabase } from "../../../../storage/with-database";
import { requireSession } from "../../../auth/session";
import { updatePlannedItemAction } from "../../actions";
import { TRANSFER_KIND } from "../../planned-item-form-data";
import { PlannedItemDetailsForm } from "../../planned-item-details-form";
import {
  accountTextOf,
  categoryOptionsOf,
  currentVersionOf,
  scheduleText,
} from "../../planned-item-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("planned");
  return { title: t("editMetaTitle") };
}

const PAGE_GAP = "gap-6";

// The back link shows at once; the title holds the name of the item, so it waits for the database
// with the form.
export default async function EditPlannedItemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const t = await getTranslations("planned");

  return (
    <main className={`mx-auto flex max-w-3xl flex-col ${PAGE_GAP} p-8`}>
      <Link href="/planned" className="self-start underline">
        {t("backToPlanned")}
      </Link>
      <Suspense fallback={<EditPlannedItemLoading />}>
        <EditPlannedItem params={params} />
      </Suspense>
    </main>
  );
}

function EditPlannedItemLoading() {
  const loading = useTranslations("loading");

  return (
    <SkeletonRegion label={loading("form")} className={`flex flex-col ${PAGE_GAP}`}>
      <SkeletonLine size="heading" width="1/3" />
      <SkeletonFields count={3} />
    </SkeletonRegion>
  );
}

async function EditPlannedItem({ params }: { params: Promise<{ id: string }> }) {
  await requireSession();
  // The id comes from the URL, which the shared App Shell cannot hold: it is read here.
  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isSafeInteger(id)) notFound();
  // The page reads the database: it must run per request, never at build time.
  await connection();
  const [t, locale] = await Promise.all([getTranslations("planned"), getLocale()]);

  // The read of one record for a form stays uncached (ADR-023).
  let data;
  try {
    data = withDatabase((db) => ({
      item: getPlannedItem(db, id),
      accounts: listAccounts(db, { includeArchived: true }),
      categories: listCategories(db, { includeArchived: true }),
    }));
  } catch (error) {
    if (error instanceof PlannedItemNotFoundError) notFound();
    throw error;
  }
  const { item, accounts, categories } = data;

  const accountNames = new Map(accounts.map((account) => [account.id, account.name]));
  const version = currentVersionOf(item);
  const facts = [
    { label: t("facts.kind"), value: t(`kinds.${item.kind}`) },
    {
      label: t("facts.account"),
      value: accountTextOf(item, accountNames, (names) => t("transferAccounts", names)),
    },
    { label: t("facts.startDate"), value: formatCalendarDate(item.startDate, locale) },
    { label: t("facts.schedule"), value: scheduleText((key, values) => t(key, values), locale, item) },
    { label: t("form.businessDay"), value: t(`form.businessDayRules.${version.businessDayRule}`) },
    {
      label: t("facts.amount"),
      value: formatAmount(
        version.amount,
        accounts.find((account) => account.id === item.accountId)?.currency ?? "",
        locale,
      ),
    },
  ];

  return (
    <>
      <h1 className="text-heading font-medium">{t("editTitle", { name: item.name })}</h1>
      <section aria-labelledby="fixed-heading" className="flex max-w-md flex-col gap-3">
        <h2 id="fixed-heading" className="text-title font-medium">
          {t("fixedHeading")}
        </h2>
        <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-1">
          {facts.map((fact) => (
            <div key={fact.label} className="contents">
              <dt className="text-text-muted">{fact.label}</dt>
              <dd>{fact.value}</dd>
            </div>
          ))}
        </dl>
        <p className="text-caption text-text-muted">{t("fixedNote")}</p>
      </section>
      <PlannedItemDetailsForm
        action={updatePlannedItemAction.bind(null, item.id)}
        initialValues={{
          name: item.name,
          categoryId: item.categoryId === null ? "" : String(item.categoryId),
          matchWindowDays: String(item.matchWindowDays),
          matchTolerancePercent: formatTolerancePercent(item.matchAmountToleranceBp),
        }}
        categories={categoryOptionsOf(categories, item.categoryId, (name) =>
          t("categoryArchived", { name }),
        )}
        hasCategory={item.kind !== TRANSFER_KIND}
      />
    </>
  );
}
