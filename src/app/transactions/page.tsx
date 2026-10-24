import type { Metadata } from "next";
import { getLocale, getTranslations, getTimeZone } from "next-intl/server";
import Link from "next/link";
import { connection } from "next/server";

import { formatAmount } from "../../domain/money";
import { formatCalendarDate, todayIn } from "../../i18n/dates";
import { listAccounts } from "../../ledger/accounts";
import { listCategories } from "../../ledger/categories";
import { listTransactions, type Transaction } from "../../ledger/transactions";
import { withDatabase } from "../../storage/with-database";
import { ConfirmActionButton } from "../confirm-action-button";
import {
  createTransactionAction,
  createTransferAction,
  deleteTransactionAction,
} from "./actions";
import { TransactionForm } from "./transaction-form";
import { TransferForm } from "./transfer-form";
import { requireSession } from "../auth/session";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("transactions");
  return { title: t("metaTitle") };
}

export default async function TransactionsPage() {
  await requireSession();
  // The page reads the database: it must run per request, never at build time.
  await connection();
  const [t, common, locale, timeZone] = await Promise.all([
    getTranslations("transactions"),
    getTranslations("common"),
    getLocale(),
    getTimeZone(),
  ]);
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
    if (row.categoryId === null) return t("toCategorize");
    return categoryNameById.get(row.categoryId);
  };
  const today = todayIn(timeZone, new Date());

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-10 p-8">
      <Link href="/" className="self-start underline">
        {common("backToHome")}
      </Link>
      <h1 className="text-2xl font-semibold">{t("title")}</h1>

      <section aria-labelledby="list-heading" className="flex flex-col gap-3">
        <h2 id="list-heading" className="text-xl font-semibold">
          {t("listHeading")}
        </h2>
        {rows.length === 0 ? (
          <p>{t("empty")}</p>
        ) : (
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-neutral-500">
                <th scope="col" className="py-2 pr-4">{t("columns.date")}</th>
                <th scope="col" className="py-2 pr-4">{t("columns.account")}</th>
                <th scope="col" className="py-2 pr-4">{t("columns.label")}</th>
                <th scope="col" className="py-2 pr-4">{t("columns.type")}</th>
                <th scope="col" className="py-2 pr-4">{t("columns.category")}</th>
                <th scope="col" className="py-2 pr-4">{t("columns.paymentMode")}</th>
                <th scope="col" className="py-2 pr-4 text-right">{t("columns.amount")}</th>
                <th scope="col" className="py-2">{common("actions")}</th>
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
                    <td className="py-2 pr-4 tabular-nums">
                      <time dateTime={row.date}>
                        {formatCalendarDate(row.date, locale)}
                      </time>
                    </td>
                    <td className="py-2 pr-4">{account.name}</td>
                    <th scope="row" className="py-2 pr-4 font-medium">
                      {row.label}
                    </th>
                    <td className="py-2 pr-4">{t(`kinds.${row.kind}`)}</td>
                    <td className="py-2 pr-4">{categoryLabel(row)}</td>
                    <td className="py-2 pr-4">
                      {row.paymentMode === null
                        ? ""
                        : t(`paymentModes.${row.paymentMode}`)}
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums">
                      {formatAmount(row.amount, account.currency, locale)}
                    </td>
                    <td className="py-2">
                      {account.archived ? (
                        <span>{t("archivedAccount")}</span>
                      ) : (
                        <div className="flex gap-2">
                          {row.kind === "transfer" ? null : (
                            <Link
                              href={`/transactions/${row.id}/edit`}
                              className="inline-flex min-h-11 items-center px-2 underline"
                            >
                              {t("edit")}<span className="sr-only"> {row.label}</span>
                            </Link>
                          )}
                          <ConfirmActionButton
                            action={deleteTransactionAction.bind(null, row.id)}
                            label={
                              row.kind === "transfer"
                                ? t("deleteTransfer")
                                : t("delete")
                            }
                            subject={row.label}
                            title={t("deleteTitle", { label: row.label })}
                            message={
                              row.kind === "transfer"
                                ? t("deleteTransferMessage")
                                : t("deleteMessage")
                            }
                            confirmLabel={t("deleteConfirm")}
                          />
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
          {t.rich("needAccountBefore", {
            link: (chunks) => (
              <Link href="/accounts" className="underline">
                {chunks}
              </Link>
            ),
          })}
        </p>
      ) : (
        <>
          <section aria-labelledby="new-heading" className="flex flex-col gap-3">
            <h2 id="new-heading" className="text-xl font-semibold">
              {t("addHeading")}
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
              submitLabel={t("addSubmit")}
            />
          </section>

          <section aria-labelledby="transfer-heading" className="flex flex-col gap-3">
            <h2 id="transfer-heading" className="text-xl font-semibold">
              {t("transferHeading")}
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
