import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getLocale, getTimeZone, getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

import { SkeletonFields, SkeletonLine, SkeletonRegion } from "../../../../components/skeleton";
import { Button } from "../../../../components/button";
import { formatAmount, formatEditableAmount } from "../../../../domain/money";
import { formatCalendarDate, todayIn } from "../../../../i18n/dates";
import { getAccount, listAccounts } from "../../../../ledger/accounts";
import { listCategories } from "../../../../ledger/categories";
import { listLinkCandidates, type LinkCandidate } from "../../../../ledger/planned-matching";
import { getPlannedItem } from "../../../../ledger/planned-items";
import {
  getTransaction,
  TransactionNotFoundError,
  type Transaction,
} from "../../../../ledger/transactions";
import type { AppDatabase } from "../../../../storage/database";
import { withDatabase } from "../../../../storage/with-database";
import { unlinkOccurrenceAction, linkOccurrenceAction, updateTransactionAction } from "../../actions";
import { occurrenceKey } from "../../planned-link-data";
import { PlannedLinkForm } from "../../planned-link-form";
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
  const [t, common, locale, timeZone] = await Promise.all([
    getTranslations("transactions"),
    getTranslations("common"),
    getLocale(),
    getTimeZone(),
  ]);

  let transaction;
  let account;
  let accounts;
  let categories;
  let plannedLink;
  try {
    ({ transaction, account, accounts, categories, plannedLink } = withDatabase((db) => {
      const found = getTransaction(db, id);
      return {
        transaction: found,
        account: getAccount(db, found.accountId),
        accounts: listAccounts(db),
        categories: listCategories(db, { includeArchived: true }),
        plannedLink: readPlannedLink(db, found, todayIn(timeZone, new Date())),
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
      <section aria-labelledby="planned-link-heading" className="flex flex-col gap-4">
        <h2 id="planned-link-heading" className="text-title font-medium">
          {t("plannedLink.heading")}
        </h2>
        {plannedLink.kind === "linked" ? (
          <>
            <p>
              {t("plannedLink.linked", {
                name: plannedLink.name,
                date: formatCalendarDate(plannedLink.nominalDate, locale),
              })}
            </p>
            <form action={unlinkOccurrenceAction.bind(null, transaction.id)}>
              <Button type="submit" variant="secondary">
                {t("plannedLink.unlink")}
              </Button>
            </form>
          </>
        ) : plannedLink.candidates.length > 0 ? (
          <PlannedLinkForm
            action={linkOccurrenceAction.bind(null, transaction.id)}
            options={plannedLink.candidates.map((candidate) => ({
              key: occurrenceKey(candidate.pair.plannedItemId, candidate.nominalDate),
              text: t("plannedLink.option", {
                name: candidate.plannedItemName,
                date: formatCalendarDate(candidate.date, locale),
                amount: formatAmount(candidate.amount, account.currency, locale),
                status: t(`plannedLink.status.${candidate.status}`),
              }),
            }))}
          />
        ) : (
          <p>{t("plannedLink.none")}</p>
        )}
      </section>
    </>
  );
}

type PlannedLinkState =
  | { kind: "linked"; name: string; nominalDate: string }
  | { kind: "open"; candidates: LinkCandidate[] };

function readPlannedLink(
  db: AppDatabase,
  transaction: Transaction,
  today: string,
): PlannedLinkState {
  if (transaction.plannedItemId !== null && transaction.occurrenceDate !== null) {
    return {
      kind: "linked",
      name: getPlannedItem(db, transaction.plannedItemId).name,
      nominalDate: transaction.occurrenceDate,
    };
  }
  return { kind: "open", candidates: listLinkCandidates(db, transaction.id, today) };
}
