import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

import { SkeletonFields, SkeletonLine, SkeletonRegion } from "../../../../components/skeleton";
import { splitBalanceSide } from "../../../../domain/amount-syntax";
import { formatEditableAmount } from "../../../../domain/money";
import { overflowTargetsOf } from "../../../../domain/overflow";
import { AccountNotFoundError, getAccount, listAccounts } from "../../../../ledger/accounts";
import { withDatabase } from "../../../../storage/with-database";
import { AccountForm } from "../../account-form";
import { updateAccountAction } from "../../actions";
import { requireSession } from "../../../auth/session";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("accounts");
  return { title: t("editMetaTitle") };
}

const PAGE_GAP = "gap-6";

// The back link shows at once; the title holds the name of the account, so it waits for the
// database with the form.
export default async function EditAccountPage({ params }: { params: Promise<{ id: string }> }) {
  const t = await getTranslations("accounts");

  return (
    <main className={`mx-auto flex max-w-3xl flex-col ${PAGE_GAP} p-8`}>
      <Link href="/accounts" className="self-start underline">
        {t("backToAccounts")}
      </Link>
      <Suspense fallback={<EditAccountLoading />}>
        <EditAccount params={params} />
      </Suspense>
    </main>
  );
}

function EditAccountLoading() {
  const loading = useTranslations("loading");

  return (
    <SkeletonRegion label={loading("form")} className={`flex flex-col ${PAGE_GAP}`}>
      <SkeletonLine size="heading" width="1/3" />
      <SkeletonFields count={7} />
    </SkeletonRegion>
  );
}

async function EditAccount({ params }: { params: Promise<{ id: string }> }) {
  await requireSession();
  // The id comes from the URL, which the shared App Shell cannot hold: it is read here.
  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isSafeInteger(id)) notFound();
  // The page reads the database: it must run per request, never at build time.
  await connection();
  const [t, common] = await Promise.all([getTranslations("accounts"), getTranslations("common")]);

  let account;
  let overflowOptions;
  try {
    ({ account, overflowOptions } = withDatabase((db) => ({
      account: getAccount(db, id),
      overflowOptions: overflowTargetsOf(listAccounts(db)).filter((other) => other.id !== id),
    })));
  } catch (error) {
    if (error instanceof AccountNotFoundError) notFound();
    throw error;
  }

  const opening = splitBalanceSide(account.openingBalance);

  return (
    <>
      <h1 className="text-heading font-medium">{t("editTitle", { name: account.name })}</h1>
      <AccountForm
        action={updateAccountAction.bind(null, account.id)}
        initialValues={{
          name: account.name,
          kind: account.kind,
          currency: account.currency,
          openingDate: account.openingDate,
          openingBalance: formatEditableAmount(opening.magnitude, account.currency),
          openingBalanceSide: opening.side,
          depositCeiling:
            account.depositCeiling === null
              ? ""
              : formatEditableAmount(account.depositCeiling, account.currency),
          overflowAccountId:
            account.overflowAccountId === null ? "" : String(account.overflowAccountId),
        }}
        overflowOptions={overflowOptions}
        submitLabel={common("saveChanges")}
      />
    </>
  );
}
