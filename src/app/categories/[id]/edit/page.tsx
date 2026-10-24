import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import {
  CategoryNotFoundError,
  getCategory,
} from "../../../../ledger/categories";
import { withDatabase } from "../../../../storage/with-database";
import { renameCategoryAction } from "../../actions";
import { CategoryForm } from "../../category-form";
import { requireSession } from "../../../auth/session";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("categories");
  return { title: t("renameMetaTitle") };
}

export default async function RenameCategoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireSession();
  await connection();
  const [t, common] = await Promise.all([
    getTranslations("categories"),
    getTranslations("common"),
  ]);
  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isSafeInteger(id)) notFound();

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
    <main className="mx-auto flex max-w-3xl flex-col gap-6 p-8">
      <Link href="/categories" className="self-start underline">
        {t("backToCategories")}
      </Link>
      <h1 className="text-2xl font-semibold">
        {t("renameTitle", { name: category.name })}
      </h1>
      <CategoryForm
        action={renameCategoryAction.bind(null, category.id)}
        initialName={category.name}
        submitLabel={common("saveChanges")}
      />
    </main>
  );
}
