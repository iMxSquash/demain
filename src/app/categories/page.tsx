import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { connection } from "next/server";

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
import { ToCategorizeQueue } from "./to-categorize-queue";
import { requireSession } from "../auth/session";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("categories");
  return { title: t("metaTitle") };
}

export default async function CategoriesPage() {
  await requireSession();
  // The page reads the database: it must run per request, never at build time.
  await connection();
  const [t, common] = await Promise.all([
    getTranslations("categories"),
    getTranslations("common"),
  ]);
  const { accounts, categories, archivedCategories, queue } = withDatabase((db) => {
    const all = listCategories(db, { includeArchived: true });
    return {
      accounts: listAccounts(db, { includeArchived: true }),
      categories: all.filter((category) => !category.archived),
      archivedCategories: all.filter((category) => category.archived),
      queue: listUncategorizedTransactions(db),
    };
  });

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-10 p-8">
      <Link href="/" className="self-start underline">
        {common("backToHome")}
      </Link>
      <h1 className="text-2xl font-semibold">{t("title")}</h1>

      <section aria-labelledby="queue-heading" className="flex flex-col gap-3">
        <h2 id="queue-heading" className="text-xl font-semibold">
          {t("queueHeading")}
        </h2>
        <ToCategorizeQueue
          queue={queue}
          accounts={accounts}
          categories={categories}
        />
      </section>

      <section aria-labelledby="list-heading" className="flex flex-col gap-3">
        <h2 id="list-heading" className="text-xl font-semibold">
          {t("listHeading")}
        </h2>
        {categories.length === 0 ? (
          <p>{t("empty")}</p>
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
        )}
      </section>

      {archivedCategories.length > 0 ? (
        <section
          aria-labelledby="archived-heading"
          className="flex flex-col gap-3"
        >
          <h2 id="archived-heading" className="text-xl font-semibold">
            {t("archivedHeading")}
          </h2>
          <p>{t("archivedIntro")}</p>
          <ul className="flex flex-col">
            {archivedCategories.map((category) => (
              <li
                key={category.id}
                className="flex items-center justify-between border-b border-neutral-300 py-1"
              >
                <span className="font-medium">{category.name}</span>
                <form action={reactivateCategoryAction.bind(null, category.id)}>
                  <button type="submit" className="min-h-11 px-2 underline">
                    {t("reactivate")}
                    <span className="sr-only"> {category.name}</span>
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="new-heading" className="flex flex-col gap-3">
        <h2 id="new-heading" className="text-xl font-semibold">
          {t("addHeading")}
        </h2>
        <CategoryForm
          action={createCategoryAction}
          initialName=""
          submitLabel={t("addSubmit")}
        />
      </section>
    </main>
  );
}
