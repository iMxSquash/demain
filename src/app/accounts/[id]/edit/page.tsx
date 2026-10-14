import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { formatEditableAmount } from "../../../../domain/money";
import { AccountNotFoundError, getAccount } from "../../../../ledger/accounts";
import { withDatabase } from "../../../../storage/with-database";
import { AccountForm } from "../../account-form";
import { updateAccountAction } from "../../actions";

export const metadata: Metadata = {
  title: "Edit account | Demain",
};

export default async function EditAccountPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isSafeInteger(id)) notFound();

  let account;
  try {
    account = withDatabase((db) => getAccount(db, id));
  } catch (error) {
    if (error instanceof AccountNotFoundError) notFound();
    throw error;
  }

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 p-8">
      <Link href="/accounts" className="self-start underline">
        Back to accounts
      </Link>
      <h1 className="text-2xl font-semibold">Edit {account.name}</h1>
      <AccountForm
        action={updateAccountAction.bind(null, account.id)}
        initialValues={{
          name: account.name,
          kind: account.kind,
          currency: account.currency,
          openingDate: account.openingDate,
          openingBalance: formatEditableAmount(
            account.openingBalance,
            account.currency,
          ),
        }}
        submitLabel="Save changes"
      />
    </main>
  );
}
