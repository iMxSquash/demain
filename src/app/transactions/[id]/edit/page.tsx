import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

import { SkeletonFields, SkeletonLine, SkeletonRegion } from "../../../../components/skeleton";
import { formatEditableAmount } from "../../../../domain/money";
import { getAccount, listAccounts } from "../../../../ledger/accounts";
import { listCategories } from "../../../../ledger/categories";
import {
  getTransaction,
  TransactionNotFoundError,
} from "../../../../ledger/transactions";
import { withDatabase } from "../../../../storage/with-database";
import { updateTransactionAction } from "../../actions";
import { TransactionForm } from "../../transaction-form";
import { requireSession } from "../../../auth/session";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("transactions");
  return { title: t("editMetaTitle") };
}

const PAGE_GAP = "gap-6";

// The back link shows at once; the title holds the label of the transaction, so it waits for the
// database with the form.
export default async function EditTransactionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const t = await getTranslations("transactions");

  return (
    <main className={`mx-auto flex max-w-3xl flex-col ${PAGE_GAP} p-8`}>
      <Link href="/transactions" className="self-start underline">
        {t("backToTransactions")}
      </Link>
      <Suspense fallback={<EditTransactionLoading />}>
        <EditTransaction params={params} />
      </Suspense>
    </main>
  );
}

function EditTransactionLoading() {
  const loading = useTranslations("loading");

  return (
    <SkeletonRegion label={loading("form")} className={`flex flex-col ${PAGE_GAP}`}>
      <SkeletonLine size="heading" width="1/3" />
      <SkeletonFields count={8} />
    </SkeletonRegion>
  );
}

async function EditTransaction({ params }: { params: Promise<{ id: string }> }) {
  await requireSession();
  // The id comes from the URL, which the shared App Shell cannot hold: it is read here.
  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isSafeInteger(id)) notFound();
  // The page reads the database: it must run per request, never at build time.
  await connection();
  const [t, common] = await Promise.all([
    getTranslations("transactions"),
    getTranslations("common"),
  ]);

  let transaction;
  let account;
  let accounts;
  let categories;
  try {
    ({ transaction, account, accounts, categories } = withDatabase((db) => {
      const found = getTransaction(db, id);
      return {
        transaction: found,
        account: getAccount(db, found.accountId),
        accounts: listAccounts(db),
        categories: listCategories(db, { includeArchived: true }),
      };
    }));
  } catch (error) {
    if (error instanceof TransactionNotFoundError) notFound();
    throw error;
  }
  // A transfer is deleted and entered again, never edited leg by leg, and an
  // archived account keeps its history untouched (DOMAIN, archiving an account).
  if (transaction.kind === "transfer" || account.archived) notFound();

  return (
    <>
      <h1 className="text-heading font-medium">
        {t("editTitle", { label: transaction.label })}
      </h1>
    <TransactionForm
      action={updateTransactionAction.bind(null, transaction.id)}
      initialValues={{
        accountId: String(transaction.accountId),
        date: transaction.date,
        kind: transaction.kind,
        amount: formatEditableAmount(Math.abs(transaction.amount), account.currency),
        label: transaction.label,
        description: transaction.description ?? "",
        paymentMode: transaction.paymentMode ?? "",
        categoryId:
          transaction.categoryId === null ? "" : String(transaction.categoryId),
      }}
      accounts={accounts}
      // An archived category the transaction already has stays selectable,
      // otherwise saving would silently clear it.
      categories={categories.filter(
        (category) => !category.archived || category.id === transaction.categoryId,
      )}
      submitLabel={common("saveChanges")}
    />
    </>
  );
}
