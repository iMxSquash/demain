import type { Metadata } from "next";
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

export const metadata: Metadata = {
  title: "Rename category | Demain",
};

export default async function RenameCategoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
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
        Back to categories
      </Link>
      <h1 className="text-2xl font-semibold">Rename {category.name}</h1>
      <CategoryForm
        action={renameCategoryAction.bind(null, category.id)}
        initialName={category.name}
        submitLabel="Save changes"
      />
    </main>
  );
}
