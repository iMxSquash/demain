import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { connection } from "next/server";

import type { AccountKind } from "../../domain/account";
import { formatAmount } from "../../domain/money";
import { overflowTargetsOf } from "../../domain/overflow";
import {
  listAccounts,
  listOverflowAccounts,
  type Account,
} from "../../ledger/accounts";
import { withDatabase } from "../../storage/with-database";
import { DataTable, EmptyState, NUMBER_CELL } from "../../components/data-display";
import { ConfirmActionButton } from "../confirm-action-button";
import { AccountForm } from "./account-form";
import { archiveAccountAction, createAccountAction } from "./actions";
import { requireSession } from "../auth/session";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("accounts");
  return { title: t("metaTitle") };
}

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
  await requireSession();
  // The page reads the database: it must run per request, never at build time.
  await connection();
  const t = await getTranslations("accounts");
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
      <h1 className="text-heading font-medium">{t("title")}</h1>

      <section aria-labelledby="active-heading" className="flex flex-col gap-3">
        <h2 id="active-heading" className="text-title font-medium">
          {t("activeHeading")}
        </h2>
        {active.length === 0 ? (
          <EmptyState action={{ href: "#new-heading", label: t("emptyAction") }}>
            {t("empty")}
          </EmptyState>
        ) : (
          <AccountTable
            caption={t("activeCaption")}
            accounts={active}
            allAccounts={all}
            balances={balances}
          />
        )}
      </section>

      <section aria-labelledby="new-heading" className="flex flex-col gap-3">
        <h2 id="new-heading" className="text-title font-medium">
          {t("addHeading")}
        </h2>
        <AccountForm
          action={createAccountAction}
          initialValues={NEW_ACCOUNT_DEFAULTS}
          overflowOptions={overflowTargetsOf(active)}
          submitLabel={t("addSubmit")}
        />
      </section>

      {archived.length > 0 ? (
        <section aria-labelledby="archived-heading" className="flex flex-col gap-3">
          <h2 id="archived-heading" className="text-title font-medium">
            {t("archivedHeading")}
          </h2>
          <AccountTable
            caption={t("archivedCaption")}
            accounts={archived}
            allAccounts={all}
            balances={balances}
          />
        </section>
      ) : null}
    </main>
  );
}

interface AccountTableProps {
  caption: string;
  accounts: Account[];
  /** Every account, archived ones included: overflow links can point to any of them. */
  allAccounts: Account[];
  /** Computed balance of each account: opening balance plus its transactions. */
  balances: ReadonlyMap<number, number>;
}

async function AccountTable({
  caption,
  accounts,
  allAccounts,
  balances,
}: AccountTableProps) {
  const [t, common] = await Promise.all([
    getTranslations("accounts"),
    getTranslations("common"),
  ]);

  return (
    <DataTable caption={caption}>
      <thead>
        <tr>
          <th scope="col">{t("columns.name")}</th>
          <th scope="col">{t("columns.kind")}</th>
          <th scope="col">{t("columns.currency")}</th>
          <th scope="col" className="text-right">{t("columns.openingBalance")}</th>
          <th scope="col" className="text-right">{t("columns.balance")}</th>
          <th scope="col" className="text-right">{t("columns.depositCeiling")}</th>
          <th scope="col">{t("columns.overflowAccount")}</th>
          <th scope="col">{common("actions")}</th>
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
    </DataTable>
  );
}

async function AccountRow({
  account,
  allAccounts,
  balance,
}: {
  account: Account;
  allAccounts: Account[];
  balance: number;
}) {
  const [t, common, locale] = await Promise.all([
    getTranslations("accounts"),
    getTranslations("common"),
    getLocale(),
  ]);
  const overflowName =
    allAccounts.find((other) => other.id === account.overflowAccountId)?.name ??
    common("none");
  // An archived referrer is ignored, as in archiveAccount.
  const referrers = allAccounts.filter(
    (other) => !other.archived && other.overflowAccountId === account.id,
  );

  return (
    <tr>
      <th scope="row">{account.name}</th>
      <td>{t(`kinds.${account.kind as AccountKind}`)}</td>
      <td>{account.currency}</td>
      <td className={NUMBER_CELL}>
        {formatAmount(account.openingBalance, account.currency, locale)}
      </td>
      <td className={NUMBER_CELL}>
        {formatAmount(balance, account.currency, locale)}
      </td>
      <td className={NUMBER_CELL}>
        {account.depositCeiling === null
          ? common("none")
          : formatAmount(account.depositCeiling, account.currency, locale)}
      </td>
      <td>{overflowName}</td>
      <td>
        {account.archived ? null : (
          <div className="flex gap-2">
            <Link
              href={`/accounts/${account.id}/edit`}
              className="inline-flex min-h-11 items-center px-2 underline"
            >
              {t("edit")}<span className="sr-only"> {account.name}</span>
            </Link>
            <Link
              href={`/accounts/${account.id}/balances`}
              className="inline-flex min-h-11 items-center px-2 underline"
            >
              {t("balances")}<span className="sr-only"> {account.name}</span>
            </Link>
            {referrers.length > 0 ? (
              <p className="inline-flex min-h-11 items-center px-2">
                {t("overflowOf", {
                  names: referrers.map((referrer) => referrer.name).join(", "),
                })}
              </p>
            ) : balance !== 0 ? (
              <p className="inline-flex min-h-11 items-center px-2">
                {t("balanceNotZero")}
              </p>
            ) : (
              <ConfirmActionButton
                action={archiveAccountAction.bind(null, account.id)}
                label={common("archive")}
                subject={account.name}
                title={t("archiveTitle", { name: account.name })}
                message={t("archiveMessage")}
                confirmLabel={t("archiveConfirm")}
              />
            )}
          </div>
        )}
      </td>
    </tr>
  );
}
