import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getLocale, getTranslations, getTimeZone } from "next-intl/server";
import Link from "next/link";
import { connection } from "next/server";
import { cache, Suspense } from "react";

import { listAssignableCategories } from "../../domain/category";
import { formatAmount } from "../../domain/money";
import { formatCalendarDate, todayIn } from "../../i18n/dates";
import { listAccounts } from "../../ledger/accounts";
import { listCategories } from "../../ledger/categories";
import { getDefaultPaymentMode } from "../../ledger/default-payment-mode";
import { listTransactions, type Transaction } from "../../ledger/transactions";
import {
  getLastUsedAccountId,
  listLabelSuggestions,
} from "../../ledger/transaction-suggestions";
import { withDatabase } from "../../storage/with-database";
import { addDays } from "../../components/date-picker-keyboard";
import { DataTable, EmptyState, Pill } from "../../components/data-display";
import { PageSection } from "../../components/page-section";
import {
  SkeletonDataTable,
  SkeletonFields,
  SkeletonRegion,
} from "../../components/skeleton";
import { ConfirmActionButton } from "../confirm-action-button";
import {
  createTransactionAction,
  createTransferAction,
  deleteTransactionAction,
} from "./actions";
import { createCategoryAction } from "../categories/actions";
import { AddTransactionForm } from "./add-transaction-form";
import { addTransactionDefaults } from "./add-transaction-defaults";
import { ADD_CARD_CLASS } from "./add-transaction-layout";
import { requireSession } from "../auth/session";
import { tagDataRead } from "../data-cache";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("transactions");
  return { title: t("metaTitle") };
}

// One read for the whole request: every section below asks for it and gets the same answer.
const readTransactions = cache(async () => {
  // Inside the `Suspense` of each section, so the page itself joins the prefetched App Shell (ADR-023).
  await requireSession();
  // The page reads the database: it must run per request, never at build time.
  await connection();
  return readTransactionsFromDatabase();
});

async function readTransactionsFromDatabase() {
  "use cache";
  tagDataRead();
  return withDatabase((db) => {
    const accounts = listAccounts(db, { includeArchived: true });
    const openAccountIds = accounts.filter((account) => !account.archived).map((account) => account.id);
    return {
      accounts,
      categories: listCategories(db, { includeArchived: true }),
      rows: listTransactions(db),
      labelSuggestions: listLabelSuggestions(db, openAccountIds),
      lastAccountId: getLastUsedAccountId(db),
      defaultPaymentMode: getDefaultPaymentMode(db),
    };
  });
}

const PAGE_GAP = "gap-10";
const YESTERDAY_OFFSET_DAYS = -1;

// The sections below show their heading at once and hold only the data in a `Suspense`, so a slow
// read never delays the rest of the page.
export default async function TransactionsPage() {
  const [t, common] = await Promise.all([
    getTranslations("transactions"),
    getTranslations("common"),
  ]);

  return (
    <main className={`mx-auto flex max-w-4xl flex-col ${PAGE_GAP} p-8`}>
      <Link href="/" className="self-start underline">
        {common("backToHome")}
      </Link>
      <h1 className="text-heading font-medium">{t("title")}</h1>

      <PageSection id="list-heading" heading={t("listHeading")}>
        <Suspense fallback={<TransactionListLoading />}>
          <TransactionList />
        </Suspense>
      </PageSection>

      <Suspense fallback={<TransactionFormsLoading />}>
        <TransactionForms />
      </Suspense>
    </main>
  );
}

// The same `thead` for the loaded table and for its skeleton.
function TransactionsHead() {
  const t = useTranslations("transactions");
  const common = useTranslations("common");

  return (
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
  );
}

function TransactionListLoading() {
  const t = useTranslations("transactions");
  const loading = useTranslations("loading");

  return (
    <SkeletonRegion label={loading("table")}>
      <SkeletonDataTable
        caption={t("caption")}
        head={<TransactionsHead />}
        columns={["start", "start", "start", "start", "start", "start", "end", "start"]}
        rows={5}
      />
    </SkeletonRegion>
  );
}

async function TransactionList() {
  const [t, locale, { accounts, categories, rows }] = await Promise.all([
    getTranslations("transactions"),
    getLocale(),
    readTransactions(),
  ]);
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

  if (rows.length === 0) {
    return (
      <EmptyState
        action={
          active.length === 0 ? undefined : { href: "#new-heading", label: t("emptyAction") }
        }
      >
        {t("empty")}
      </EmptyState>
    );
  }

  return (
    <DataTable caption={t("caption")}>
      <TransactionsHead />
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
            <td className="text-right">
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
  );
}

function TransactionFormsLoading() {
  const t = useTranslations("transactions");
  const loading = useTranslations("loading");

  return (
    <SkeletonRegion label={loading("forms")} className={`flex flex-col ${PAGE_GAP}`}>
      <section aria-labelledby="new-heading" className={`flex flex-col gap-6 ${ADD_CARD_CLASS}`}>
        <h2 id="new-heading" className="text-title font-medium">
          {t("addHeading")}
        </h2>
        <SkeletonFields count={5} />
      </section>
    </SkeletonRegion>
  );
}

async function TransactionForms() {
  const [t, timeZone, data] = await Promise.all([
    getTranslations("transactions"),
    getTimeZone(),
    readTransactions(),
  ]);
  const { accounts, categories, labelSuggestions, lastAccountId, defaultPaymentMode } = data;
  const active = accounts.filter((account) => !account.archived);
  const today = todayIn(timeZone, new Date());

  if (active.length === 0) {
    return (
      <p>
        {t.rich("needAccountBefore", {
          link: (chunks) => (
            <Link href="/accounts" className="underline">
              {chunks}
            </Link>
          ),
        })}
      </p>
    );
  }

  return (
    <AddTransactionForm
      action={createTransactionAction}
      transferAction={createTransferAction}
      categoryAction={createCategoryAction}
      initialValues={addTransactionDefaults({
        today,
        accountIds: active.map((account) => account.id),
        lastAccountId,
        defaultPaymentMode,
      })}
      accounts={active}
      categories={listAssignableCategories(categories)}
      labelSuggestions={labelSuggestions}
      today={today}
      yesterday={addDays(today, YESTERDAY_OFFSET_DAYS)}
    />
  );
}
