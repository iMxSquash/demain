import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import { formatAmount } from "../../domain/money";
import { listAccounts } from "../../ledger/accounts";
import { listCategories } from "../../ledger/categories";
import { listTransactions, type Transaction } from "../../ledger/transactions";
import { withDatabase } from "../../storage/with-database";
import { DISPLAY_LOCALE } from "../display-locale";
import {
  createTransactionAction,
  createTransferAction,
  deleteTransactionAction,
} from "./actions";
import { KIND_LABELS, PAYMENT_MODE_LABELS } from "./labels";
import { TransactionForm } from "./transaction-form";
import { TransferForm } from "./transfer-form";

export const metadata: Metadata = {
  title: "Transactions | Demain",
};

// "YYYY-MM-DD" is the first ten characters of an ISO timestamp.
const ISO_DATE_LENGTH = "YYYY-MM-DD".length;

export default async function TransactionsPage() {
  // The page reads the database: it must run per request, never at build time.
  await connection();
  const { accounts, categories, rows } = withDatabase((db) => ({
    accounts: listAccounts(db, { includeArchived: true }),
    categories: listCategories(db, { includeArchived: true }),
    rows: listTransactions(db),
  }));
  const active = accounts.filter((account) => !account.archived);
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const categoryNameById = new Map(
    categories.map((category) => [category.id, category.name]),
  );
  // A transfer never has a category, any other one waits in the queue without it.
  const categoryLabel = (row: Transaction) => {
    if (row.kind === "transfer") return "";
    if (row.categoryId === null) return "To categorize";
    return categoryNameById.get(row.categoryId);
  };
  const today = new Date().toISOString().slice(0, ISO_DATE_LENGTH);

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-10 p-8">
      <Link href="/" className="self-start underline">
        Back to home
      </Link>
      <h1 className="text-2xl font-semibold">Transactions</h1>

      <section aria-labelledby="list-heading" className="flex flex-col gap-3">
        <h2 id="list-heading" className="text-xl font-semibold">
          All transactions
        </h2>
        {rows.length === 0 ? (
          <p>No transaction yet. Add your first one below.</p>
        ) : (
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-neutral-500">
                <th scope="col" className="py-2 pr-4">Date</th>
                <th scope="col" className="py-2 pr-4">Account</th>
                <th scope="col" className="py-2 pr-4">Label</th>
                <th scope="col" className="py-2 pr-4">Type</th>
                <th scope="col" className="py-2 pr-4">Category</th>
                <th scope="col" className="py-2 pr-4">Payment mode</th>
                <th scope="col" className="py-2 pr-4 text-right">Amount</th>
                <th scope="col" className="py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
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
                    <td className="py-2 pr-4">{KIND_LABELS[row.kind]}</td>
                    <td className="py-2 pr-4">{categoryLabel(row)}</td>
                    <td className="py-2 pr-4">
                      {row.paymentMode === null
                        ? ""
                        : PAYMENT_MODE_LABELS[row.paymentMode]}
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums">
                      {formatAmount(row.amount, account.currency, DISPLAY_LOCALE)}
                    </td>
                    <td className="py-2">
                      {account.archived ? (
                        <span>Archived account</span>
                      ) : (
                        <div className="flex gap-2">
                          {row.kind === "transfer" ? null : (
                            <Link
                              href={`/transactions/${row.id}/edit`}
                              className="inline-flex min-h-11 items-center px-2 underline"
                            >
                              Edit<span className="sr-only"> {row.label}</span>
                            </Link>
                          )}
                          <form action={deleteTransactionAction.bind(null, row.id)}>
                            <button type="submit" className="min-h-11 px-2 underline">
                              {row.kind === "transfer" ? "Delete transfer" : "Delete"}
                              <span className="sr-only"> {row.label}</span>
                            </button>
                          </form>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {active.length === 0 ? (
        <p>
          Add an account on the <Link href="/accounts" className="underline">accounts page</Link>{" "}
          before entering transactions.
        </p>
      ) : (
        <>
          <section aria-labelledby="new-heading" className="flex flex-col gap-3">
            <h2 id="new-heading" className="text-xl font-semibold">
              Add a transaction
            </h2>
            <TransactionForm
              action={createTransactionAction}
              initialValues={{
                accountId: String(active[0]?.id ?? ""),
                date: today,
                kind: "expense",
                amount: "",
                label: "",
                description: "",
                paymentMode: "",
                categoryId: "",
              }}
              accounts={active}
              categories={categories.filter((category) => !category.archived)}
              submitLabel="Add transaction"
            />
          </section>

          <section aria-labelledby="transfer-heading" className="flex flex-col gap-3">
            <h2 id="transfer-heading" className="text-xl font-semibold">
              Add a transfer
            </h2>
            <TransferForm
              action={createTransferAction}
              initialValues={{
                sourceId: String(active[0]?.id ?? ""),
                destinationId: String(active[1]?.id ?? active[0]?.id ?? ""),
                date: today,
                amount: "",
                label: "",
              }}
              accounts={active}
            />
          </section>
        </>
      )}
    </main>
  );
}
