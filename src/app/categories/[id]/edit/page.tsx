import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

import { SkeletonFields, SkeletonLine, SkeletonRegion } from "../../../../components/skeleton";
import {
  CategoryNotFoundError,
  getCategory,
} from "../../../../ledger/categories";
import { withDatabase } from "../../../../storage/with-database";
import { updateCategoryAction } from "../../actions";
import { CategoryForm } from "../../category-form";
import { requireSession } from "../../../auth/session";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("categories");
  return { title: t("renameMetaTitle") };
}

const PAGE_GAP = "gap-6";

// The back link shows at once; the title holds the name of the category, so it waits for the
// database with the form.
export default async function RenameCategoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const t = await getTranslations("categories");

  return (
    <main className={`mx-auto flex max-w-3xl flex-col ${PAGE_GAP} p-8`}>
      <Link href="/categories" className="self-start underline">
        {t("backToCategories")}
      </Link>
      <Suspense fallback={<RenameCategoryLoading />}>
        <RenameCategory params={params} />
      </Suspense>
    </main>
  );
}

function RenameCategoryLoading() {
  const loading = useTranslations("loading");

  return (
    <SkeletonRegion label={loading("form")} className={`flex flex-col ${PAGE_GAP}`}>
      <SkeletonLine size="heading" width="1/3" />
      <SkeletonFields count={1} />
    </SkeletonRegion>
  );
}

async function RenameCategory({ params }: { params: Promise<{ id: string }> }) {
  await requireSession();
  // The id comes from the URL, which the shared App Shell cannot hold: it is read here.
  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isSafeInteger(id)) notFound();
  // The page reads the database: it must run per request, never at build time.
  await connection();
  const [t, common] = await Promise.all([
    getTranslations("categories"),
    getTranslations("common"),
  ]);

  let category;
  try {
    category = withDatabase((db) => getCategory(db, id));
  } catch (error) {
    if (error instanceof CategoryNotFoundError) notFound();
    throw error;
  }
  // An archived category cannot be edited any more: it only keeps the history.
  if (category.archived) notFound();

  return (
    <>
      <h1 className="text-heading font-medium">
        {t("renameTitle", { name: category.name })}
      </h1>
    <CategoryForm
      action={updateCategoryAction.bind(null, category.id)}
      initialName={category.name}
      initialIcon={category.icon}
      submitLabel={common("saveChanges")}
    />
    </>
  );
}
