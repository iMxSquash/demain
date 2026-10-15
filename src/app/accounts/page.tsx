import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import { formatAmount } from "../../domain/money";
import {
  listAccounts,
  listOverflowAccounts,
  type Account,
} from "../../ledger/accounts";
import { withDatabase } from "../../storage/with-database";
import { DISPLAY_LOCALE } from "../display-locale";
import { AccountForm } from "./account-form";
import { archiveAccountAction, createAccountAction } from "./actions";

export const metadata: Metadata = {
  title: "Accounts | Demain",
};

const NEW_ACCOUNT_DEFAULTS = {
  name: "",
  kind: "checking",
  currency: "EUR",
  openingDate: "",
  openingBalance: "0",
  depositCeiling: "",
  overflowAccountId: "",
};

export default async function AccountsPage() {
  // The page reads the database: it must run per request, never at build time.
  await connection();
  const { all, balances } = withDatabase((db) => ({
    all: listAccounts(db, { includeArchived: true }),
    balances: new Map(
      listOverflowAccounts(db).map((account) => [account.id, account.balance]),
    ),
  }));
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
          <AccountTable accounts={active} allAccounts={all} balances={balances} />
        )}
      </section>

      <section aria-labelledby="new-heading" className="flex flex-col gap-3">
        <h2 id="new-heading" className="text-xl font-semibold">
          Add an account
        </h2>
        <AccountForm
          action={createAccountAction}
          initialValues={NEW_ACCOUNT_DEFAULTS}
          overflowOptions={active}
          submitLabel="Add account"
        />
      </section>

      {archived.length > 0 ? (
        <section aria-labelledby="archived-heading" className="flex flex-col gap-3">
          <h2 id="archived-heading" className="text-xl font-semibold">
            Archived accounts
          </h2>
          <AccountTable accounts={archived} allAccounts={all} balances={balances} />
        </section>
      ) : null}
    </main>
  );
}

interface AccountTableProps {
  accounts: Account[];
  /** Every account, archived ones included: overflow links can point to any of them. */
  allAccounts: Account[];
  /** Computed balance of each account: opening balance plus its transactions. */
  balances: ReadonlyMap<number, number>;
}

function AccountTable({ accounts, allAccounts, balances }: AccountTableProps) {
  return (
    <table className="w-full border-collapse text-left">
      <thead>
        <tr className="border-b border-neutral-500">
          <th scope="col" className="py-2 pr-4">Name</th>
          <th scope="col" className="py-2 pr-4">Kind</th>
          <th scope="col" className="py-2 pr-4">Currency</th>
          <th scope="col" className="py-2 pr-4 text-right">Opening balance</th>
          <th scope="col" className="py-2 pr-4 text-right">Balance</th>
          <th scope="col" className="py-2 pr-4 text-right">Deposit ceiling</th>
          <th scope="col" className="py-2 pr-4">Overflow account</th>
          <th scope="col" className="py-2">Actions</th>
        </tr>
      </thead>
      <tbody>
        {accounts.map((account) => (
          <AccountRow
            key={account.id}
            account={account}
            allAccounts={allAccounts}
            balance={balances.get(account.id) ?? account.openingBalance}
          />
        ))}
      </tbody>
    </table>
  );
}

function AccountRow({
  account,
  allAccounts,
  balance,
}: {
  account: Account;
  allAccounts: Account[];
  balance: number;
}) {
  const overflowName =
    allAccounts.find((other) => other.id === account.overflowAccountId)?.name ??
    "None";
  // An archived referrer is ignored, as in archiveAccount.
  const referrers = allAccounts.filter(
    (other) => !other.archived && other.overflowAccountId === account.id,
  );

  return (
    <tr className="border-b border-neutral-300">
      <th scope="row" className="py-2 pr-4 font-medium">{account.name}</th>
      <td className="py-2 pr-4">{account.kind}</td>
      <td className="py-2 pr-4">{account.currency}</td>
      <td className="py-2 pr-4 text-right tabular-nums">
        {formatAmount(account.openingBalance, account.currency, DISPLAY_LOCALE)}
      </td>
      <td className="py-2 pr-4 text-right tabular-nums">
        {formatAmount(balance, account.currency, DISPLAY_LOCALE)}
      </td>
      <td className="py-2 pr-4 text-right tabular-nums">
        {account.depositCeiling === null
          ? "None"
          : formatAmount(account.depositCeiling, account.currency, DISPLAY_LOCALE)}
      </td>
      <td className="py-2 pr-4">{overflowName}</td>
      <td className="py-2">
        {account.archived ? null : (
          <div className="flex gap-2">
            <Link
              href={`/accounts/${account.id}/edit`}
              className="inline-flex min-h-11 items-center px-2 underline"
            >
              Edit<span className="sr-only"> {account.name}</span>
            </Link>
            {referrers.length > 0 ? (
              <p className="inline-flex min-h-11 items-center px-2">
                Overflow account of{" "}
                {referrers.map((referrer) => referrer.name).join(", ")}: change it
                to archive
              </p>
            ) : balance !== 0 ? (
              <p className="inline-flex min-h-11 items-center px-2">
                Balance is not zero: empty this account first to archive it
              </p>
            ) : (
              <form action={archiveAccountAction.bind(null, account.id)}>
                <button type="submit" className="min-h-11 px-2 underline">
                  Archive<span className="sr-only"> {account.name}</span>
                </button>
              </form>
            )}
          </div>
        )}
      </td>
    </tr>
  );
}
