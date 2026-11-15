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
import { DataTable, EmptyState, NUMBER_CELL, Pill } from "../../components/data-display";
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
  const categoryCell = (row: Transaction) => {
    if (row.kind === "transfer") return "";
    if (row.categoryId === null) return <Pill tone="warning">{t("toCategorize")}</Pill>;
    return categoryNameById.get(row.categoryId);
  };
  const today = todayIn(timeZone, new Date());

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-10 p-8">
      <Link href="/" className="self-start underline">
        {common("backToHome")}
      </Link>
      <h1 className="text-heading font-medium">{t("title")}</h1>

      <section aria-labelledby="list-heading" className="flex flex-col gap-3">
        <h2 id="list-heading" className="text-title font-medium">
          {t("listHeading")}
        </h2>
        {rows.length === 0 ? (
          <EmptyState
            action={
              active.length === 0
                ? undefined
                : { href: "#new-heading", label: t("emptyAction") }
            }
          >
            {t("empty")}
          </EmptyState>
        ) : (
          <DataTable caption={t("caption")}>
            <thead>
              <tr>
                <th scope="col">{t("columns.date")}</th>
                <th scope="col">{t("columns.account")}</th>
                <th scope="col">{t("columns.label")}</th>
                <th scope="col">{t("columns.type")}</th>
                <th scope="col">{t("columns.category")}</th>
                <th scope="col">{t("columns.paymentMode")}</th>
                <th scope="col" className="text-right">{t("columns.amount")}</th>
                <th scope="col">{common("actions")}</th>
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
                  <tr key={row.id}>
                    <td className="tabular-nums">
                      <time dateTime={row.date}>
                        {formatCalendarDate(row.date, locale)}
                      </time>
                    </td>
                    <td>{account.name}</td>
                    <th scope="row">
                      {row.label}
                    </th>
                    <td>{t(`kinds.${row.kind}`)}</td>
                    <td>{categoryCell(row)}</td>
                    <td>
                      {row.paymentMode === null
                        ? ""
                        : t(`paymentModes.${row.paymentMode}`)}
                    </td>
                    <td className={NUMBER_CELL}>
                      {formatAmount(row.amount, account.currency, locale)}
                    </td>
                    <td>
                      {account.archived ? (
                        <Pill>{t("archivedAccount")}</Pill>
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
          </DataTable>
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
            <h2 id="new-heading" className="text-title font-medium">
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
            <h2 id="transfer-heading" className="text-title font-medium">
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
