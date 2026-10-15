import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import { listAccounts } from "../../ledger/accounts";
import { listCategories } from "../../ledger/categories";
import { listUncategorizedTransactions } from "../../ledger/transactions";
import { withDatabase } from "../../storage/with-database";
import { archiveCategoryAction, createCategoryAction } from "./actions";
import { CategoryForm } from "./category-form";
import { ToCategorizeQueue } from "./to-categorize-queue";

export const metadata: Metadata = {
  title: "Categories | Demain",
};

export default async function CategoriesPage() {
  // The page reads the database: it must run per request, never at build time.
  await connection();
  const { accounts, categories, queue } = withDatabase((db) => ({
    accounts: listAccounts(db, { includeArchived: true }),
    categories: listCategories(db),
    queue: listUncategorizedTransactions(db),
  }));

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-10 p-8">
      <Link href="/" className="self-start underline">
        Back to home
      </Link>
      <h1 className="text-2xl font-semibold">Categories</h1>

      <section aria-labelledby="queue-heading" className="flex flex-col gap-3">
        <h2 id="queue-heading" className="text-xl font-semibold">
          To categorize
        </h2>
        <ToCategorizeQueue
          queue={queue}
          accounts={accounts}
          categories={categories}
        />
      </section>

      <section aria-labelledby="list-heading" className="flex flex-col gap-3">
        <h2 id="list-heading" className="text-xl font-semibold">
          Active categories
        </h2>
        {categories.length === 0 ? (
          <p>No category yet. Add your first category below.</p>
        ) : (
          <ul className="flex flex-col">
            {categories.map((category) => (
              <li
                key={category.id}
                className="flex items-center justify-between border-b border-neutral-300 py-1"
              >
                <span className="font-medium">{category.name}</span>
                <div className="flex gap-2">
                  <Link
                    href={`/categories/${category.id}/edit`}
                    className="inline-flex min-h-11 items-center px-2 underline"
                  >
                    Rename<span className="sr-only"> {category.name}</span>
                  </Link>
                  <form action={archiveCategoryAction.bind(null, category.id)}>
                    <button type="submit" className="min-h-11 px-2 underline">
                      Archive<span className="sr-only"> {category.name}</span>
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="new-heading" className="flex flex-col gap-3">
        <h2 id="new-heading" className="text-xl font-semibold">
          Add a category
        </h2>
        <CategoryForm
          action={createCategoryAction}
          initialName=""
          submitLabel="Add category"
        />
      </section>
    </main>
  );
}
