import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { connection } from "next/server";
import { cache, Suspense } from "react";

import { Button } from "../../components/button";
import { PageSection } from "../../components/page-section";
import {
  SkeletonDataTable,
  SkeletonRegion,
  SkeletonRows,
} from "../../components/skeleton";
import { listAccounts } from "../../ledger/accounts";
import { listCategories } from "../../ledger/categories";
import { listUncategorizedTransactions } from "../../ledger/transactions";
import { withDatabase } from "../../storage/with-database";
import { ConfirmActionButton } from "../confirm-action-button";
import {
  archiveCategoryAction,
  createCategoryAction,
  reactivateCategoryAction,
} from "./actions";
import { CategoryForm } from "./category-form";
import { ToCategorizeHead, ToCategorizeQueue } from "./to-categorize-queue";
import { requireSession } from "../auth/session";
import { tagDataRead } from "../data-cache";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("categories");
  return { title: t("metaTitle") };
}

// One read for the whole request: every section below asks for it and gets the same answer.
const readCategories = cache(async () => {
  // Inside the `Suspense` of each section, so the page itself joins the prefetched App Shell (ADR-023).
  await requireSession();
  // The page reads the database: it must run per request, never at build time.
  await connection();
  return readCategoriesFromDatabase();
});

async function readCategoriesFromDatabase() {
  "use cache";
  tagDataRead();
  return withDatabase((db) => {
    const all = listCategories(db, { includeArchived: true });
    return {
      accounts: listAccounts(db, { includeArchived: true }),
      categories: all.filter((category) => !category.archived),
      archivedCategories: all.filter((category) => category.archived),
      queue: listUncategorizedTransactions(db),
    };
  });
}

// One row of a list of categories: the loaded list and its skeleton have the same box. The height
// is that of the buttons (the minimum target size) with the padding and the hairline of the row.
const CATEGORY_ROW_CLASS = "flex items-center justify-between border-b border-divider py-1";
const CATEGORY_ROW_HEIGHT = "min-h-[calc(var(--target-min)+0.5rem+1px)]";

// The sections show their heading at once and hold only the data in a `Suspense`, so a slow read
// never delays the rest of the page. The form to add a category needs no data: it is drawn at once.
export default async function CategoriesPage() {
  const [t, common] = await Promise.all([
    getTranslations("categories"),
    getTranslations("common"),
  ]);

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-10 p-8">
      <Link href="/" className="self-start underline">
        {common("backToHome")}
      </Link>
      <h1 className="text-heading font-medium">{t("title")}</h1>

      <PageSection id="queue-heading" heading={t("queueHeading")}>
        <Suspense fallback={<QueueLoading />}>
          <Queue />
        </Suspense>
      </PageSection>

      <PageSection id="list-heading" heading={t("listHeading")}>
        <Suspense fallback={<CategoryListLoading />}>
          <CategoryList />
        </Suspense>
      </PageSection>

      {/* Nothing is drawn for it while it loads: most of the time there is no archived category. */}
      <Suspense fallback={null}>
        <ArchivedCategories />
      </Suspense>

      <PageSection id="new-heading" heading={t("addHeading")}>
        <CategoryForm
          action={createCategoryAction}
          initialName=""
          submitLabel={t("addSubmit")}
        />
      </PageSection>
    </main>
  );
}

function QueueLoading() {
  const t = useTranslations("categories");
  const loading = useTranslations("loading");

  return (
    <SkeletonRegion label={loading("table")}>
      <SkeletonDataTable
        caption={t("queueCaption")}
        head={<ToCategorizeHead />}
        columns={["start", "start", "start", "end", "start"]}
        rows={3}
      />
    </SkeletonRegion>
  );
}

async function Queue() {
  const { accounts, categories, queue } = await readCategories();

  return <ToCategorizeQueue queue={queue} accounts={accounts} categories={categories} />;
}

function CategoryListLoading() {
  const loading = useTranslations("loading");

  return (
    <SkeletonRegion label={loading("list")}>
      <SkeletonRows
        columns={1}
        rows={4}
        rowClassName={`${CATEGORY_ROW_CLASS} ${CATEGORY_ROW_HEIGHT}`}
      />
    </SkeletonRegion>
  );
}

async function CategoryList() {
  const [t, common, { categories }] = await Promise.all([
    getTranslations("categories"),
    getTranslations("common"),
    readCategories(),
  ]);

  if (categories.length === 0) return <p>{t("empty")}</p>;
  return (
    <ul className="flex flex-col">
      {categories.map((category) => (
        <li key={category.id} className={CATEGORY_ROW_CLASS}>
          <span className="font-medium">{category.name}</span>
          <div className="flex gap-2">
            <Link
              href={`/categories/${category.id}/edit`}
              className="inline-flex min-h-11 items-center px-2 underline"
            >
              {t("rename")}<span className="sr-only"> {category.name}</span>
            </Link>
            <ConfirmActionButton
              action={archiveCategoryAction.bind(null, category.id)}
              label={common("archive")}
              subject={category.name}
              title={t("archiveTitle", { name: category.name })}
              message={t("archiveMessage")}
              confirmLabel={t("archiveConfirm")}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

async function ArchivedCategories() {
  const [t, { archivedCategories }] = await Promise.all([
    getTranslations("categories"),
    readCategories(),
  ]);

  if (archivedCategories.length === 0) return null;
  return (
    <PageSection id="archived-heading" heading={t("archivedHeading")}>
      <p>{t("archivedIntro")}</p>
      <ul className="flex flex-col">
        {archivedCategories.map((category) => (
          <li key={category.id} className={CATEGORY_ROW_CLASS}>
            <span className="font-medium">{category.name}</span>
            <form action={reactivateCategoryAction.bind(null, category.id)}>
              <Button type="submit" variant="link">
                {t("reactivate")}
                <span className="sr-only"> {category.name}</span>
              </Button>
            </form>
          </li>
        ))}
      </ul>
    </PageSection>
  );
}
