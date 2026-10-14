import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import { formatAmount } from "../../domain/money";
import { listAccounts, type Account } from "../../ledger/accounts";
import { withDatabase } from "../../storage/with-database";
import { AccountForm } from "./account-form";
import { archiveAccountAction, createAccountAction } from "./actions";

export const metadata: Metadata = {
  title: "Accounts | Demain",
};

// Display locale until the i18n foundations land (issue #18).
const DISPLAY_LOCALE = "en";

const NEW_ACCOUNT_DEFAULTS = {
  name: "",
  kind: "checking",
  currency: "EUR",
  openingDate: "",
  openingBalance: "0",
};

export default async function AccountsPage() {
  // The page reads the database: it must run per request, never at build time.
  await connection();
  const all = withDatabase((db) => listAccounts(db, { includeArchived: true }));
  const active = all.filter((account) => !account.archived);
  const archived = all.filter((account) => account.archived);

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-10 p-8">
      <h1 className="text-2xl font-semibold">Accounts</h1>

      <section aria-labelledby="active-heading" className="flex flex-col gap-3">
        <h2 id="active-heading" className="text-xl font-semibold">
          Active accounts
        </h2>
        {active.length === 0 ? (
          <p>No account yet. Add your first account below.</p>
        ) : (
          <AccountTable accounts={active} />
        )}
      </section>

      <section aria-labelledby="new-heading" className="flex flex-col gap-3">
        <h2 id="new-heading" className="text-xl font-semibold">
          Add an account
        </h2>
        <AccountForm
          action={createAccountAction}
          initialValues={NEW_ACCOUNT_DEFAULTS}
          submitLabel="Add account"
        />
      </section>

      {archived.length > 0 ? (
        <section aria-labelledby="archived-heading" className="flex flex-col gap-3">
          <h2 id="archived-heading" className="text-xl font-semibold">
            Archived accounts
          </h2>
          <AccountTable accounts={archived} />
        </section>
      ) : null}
    </main>
  );
}

function AccountTable({ accounts }: { accounts: Account[] }) {
  return (
    <table className="w-full border-collapse text-left">
      <thead>
        <tr className="border-b border-neutral-500">
          <th scope="col" className="py-2 pr-4">Name</th>
          <th scope="col" className="py-2 pr-4">Kind</th>
          <th scope="col" className="py-2 pr-4">Currency</th>
          <th scope="col" className="py-2 pr-4 text-right">Opening balance</th>
          <th scope="col" className="py-2">Actions</th>
        </tr>
      </thead>
      <tbody>
        {accounts.map((account) => (
          <tr key={account.id} className="border-b border-neutral-300">
            <th scope="row" className="py-2 pr-4 font-medium">{account.name}</th>
            <td className="py-2 pr-4">{account.kind}</td>
            <td className="py-2 pr-4">{account.currency}</td>
            <td className="py-2 pr-4 text-right tabular-nums">
              {formatAmount(account.openingBalance, account.currency, DISPLAY_LOCALE)}
            </td>
            <td className="py-2">
              {account.archived ? null : (
                <div className="flex gap-2">
                  <Link
                    href={`/accounts/${account.id}/edit`}
                    className="inline-flex min-h-11 items-center px-2 underline"
                  >
                    Edit<span className="sr-only"> {account.name}</span>
                  </Link>
                  <form action={archiveAccountAction.bind(null, account.id)}>
                    <button
                      type="submit"
                      className="min-h-11 px-2 underline"
                    >
                      Archive<span className="sr-only"> {account.name}</span>
                    </button>
                  </form>
                </div>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
