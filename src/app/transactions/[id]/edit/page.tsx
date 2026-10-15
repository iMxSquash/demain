import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";

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

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("transactions");
  return { title: t("editMetaTitle") };
}

export default async function EditTransactionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const [t, common] = await Promise.all([
    getTranslations("transactions"),
    getTranslations("common"),
  ]);
  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isSafeInteger(id)) notFound();

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
    <main className="mx-auto flex max-w-3xl flex-col gap-6 p-8">
      <Link href="/transactions" className="self-start underline">
        {t("backToTransactions")}
      </Link>
      <h1 className="text-2xl font-semibold">
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
    </main>
  );
}
