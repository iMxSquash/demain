import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import { formatAmount } from "../../domain/money";
import { listAccounts } from "../../ledger/accounts";
import { listCategories } from "../../ledger/categories";
import { listUncategorizedTransactions } from "../../ledger/transactions";
import { withDatabase } from "../../storage/with-database";
import { DISPLAY_LOCALE } from "../display-locale";
import { CONTROL_CLASS } from "../form-field";
import {
  archiveCategoryAction,
  categorizeTransactionAction,
  createCategoryAction,
} from "./actions";
import { CategoryForm } from "./category-form";

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
  const accountById = new Map(accounts.map((account) => [account.id, account]));

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
        {queue.length === 0 ? (
          <p>Nothing to categorize: every transaction has a category.</p>
        ) : (
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-neutral-500">
                <th scope="col" className="py-2 pr-4">Date</th>
                <th scope="col" className="py-2 pr-4">Account</th>
                <th scope="col" className="py-2 pr-4">Label</th>
                <th scope="col" className="py-2 pr-4 text-right">Amount</th>
                <th scope="col" className="py-2">Category</th>
              </tr>
            </thead>
            <tbody>
              {queue.map((row) => {
                const account = accountById.get(row.accountId);
                if (account === undefined) {
                  throw new Error(
                    `Transaction ${row.id} points to unknown account ${row.accountId}`,
                  );
                }
                return (
                  <tr key={row.id} className="border-b border-neutral-300">
                    <td className="py-2 pr-4 tabular-nums">{row.date}</td>
                    <td className="py-2 pr-4">{account.name}</td>
                    <th scope="row" className="py-2 pr-4 font-medium">
                      {row.label}
                    </th>
                    <td className="py-2 pr-4 text-right tabular-nums">
                      {formatAmount(row.amount, account.currency, DISPLAY_LOCALE)}
                    </td>
                    <td className="py-2">
                      <form
                        action={categorizeTransactionAction.bind(null, row.id)}
                        className="flex gap-2"
                      >
                        <label htmlFor={`category-${row.id}`} className="sr-only">
                          Category for {row.label}
                        </label>
                        <select
                          id={`category-${row.id}`}
                          name="categoryId"
                          defaultValue=""
                          className={CONTROL_CLASS}
                        >
                          <option value="">Choose a category</option>
                          {categories.map((category) => (
                            <option key={category.id} value={category.id}>
                              {category.name}
                            </option>
                          ))}
                        </select>
                        <button type="submit" className="min-h-11 px-2 underline">
                          Categorize<span className="sr-only"> {row.label}</span>
                        </button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
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
