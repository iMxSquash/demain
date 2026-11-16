import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { connection } from "next/server";
import { cache, Suspense } from "react";

import type { AccountKind } from "../../domain/account";
import { formatAmount } from "../../domain/money";
import { overflowTargetsOf } from "../../domain/overflow";
import {
  listAccounts,
  listOverflowAccounts,
  type Account,
} from "../../ledger/accounts";
import { withDatabase } from "../../storage/with-database";
import { DataTable, EmptyState } from "../../components/data-display";
import { PageSection } from "../../components/page-section";
import {
  SkeletonDataTable,
  SkeletonFields,
  SkeletonRegion,
} from "../../components/skeleton";
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

// One read for the whole request: every section below asks for it and gets the same answer.
const readAccounts = cache(async () => {
  // The page reads the database: it must run per request, never at build time.
  await connection();
  return withDatabase((db) => ({
    all: listAccounts(db, { includeArchived: true }),
    balances: new Map(
      listOverflowAccounts(db).map((account) => [account.id, account.balance]),
    ),
  }));
});

// The sections show their heading at once and hold only the data in a `Suspense`, so a slow read
// never delays the rest of the page.
export default async function AccountsPage() {
  await requireSession();
  const t = await getTranslations("accounts");

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-10 p-8">
      <h1 className="text-heading font-medium">{t("title")}</h1>

      <PageSection id="active-heading" heading={t("activeHeading")}>
        <Suspense fallback={<ActiveAccountsLoading />}>
          <ActiveAccounts />
        </Suspense>
      </PageSection>

      <PageSection id="new-heading" heading={t("addHeading")}>
        <Suspense fallback={<NewAccountLoading />}>
          <NewAccount />
        </Suspense>
      </PageSection>

      {/* Nothing is drawn for it while it loads: most of the time there is no archived account. */}
      <Suspense fallback={null}>
        <ArchivedAccounts />
      </Suspense>
    </main>
  );
}

// The same `thead` for the loaded tables and for the skeleton.
function AccountsHead() {
  const t = useTranslations("accounts");
  const common = useTranslations("common");

  return (
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
  );
}

function ActiveAccountsLoading() {
  const t = useTranslations("accounts");
  const loading = useTranslations("loading");

  return (
    <SkeletonRegion label={loading("table")}>
      <SkeletonDataTable
        caption={t("activeCaption")}
        head={<AccountsHead />}
        columns={["start", "start", "start", "end", "end", "end", "start", "start"]}
        rows={3}
      />
    </SkeletonRegion>
  );
}

async function ActiveAccounts() {
  const [t, { all, balances }] = await Promise.all([
    getTranslations("accounts"),
    readAccounts(),
  ]);
  const active = all.filter((account) => !account.archived);

  if (active.length === 0) {
    return (
      <EmptyState action={{ href: "#new-heading", label: t("emptyAction") }}>
        {t("empty")}
      </EmptyState>
    );
  }
  return (
    <AccountTable
      caption={t("activeCaption")}
      accounts={active}
      allAccounts={all}
      balances={balances}
    />
  );
}

function NewAccountLoading() {
  const loading = useTranslations("loading");

  return (
    <SkeletonRegion label={loading("form")}>
      <SkeletonFields count={7} />
    </SkeletonRegion>
  );
}

async function NewAccount() {
  const [t, { all }] = await Promise.all([getTranslations("accounts"), readAccounts()]);

  return (
    <AccountForm
      action={createAccountAction}
      initialValues={NEW_ACCOUNT_DEFAULTS}
      overflowOptions={overflowTargetsOf(all.filter((account) => !account.archived))}
      submitLabel={t("addSubmit")}
    />
  );
}

async function ArchivedAccounts() {
  const [t, { all, balances }] = await Promise.all([
    getTranslations("accounts"),
    readAccounts(),
  ]);
  const archived = all.filter((account) => account.archived);

  if (archived.length === 0) return null;
  return (
    <PageSection id="archived-heading" heading={t("archivedHeading")}>
      <AccountTable
        caption={t("archivedCaption")}
        accounts={archived}
        allAccounts={all}
        balances={balances}
      />
    </PageSection>
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

function AccountTable({ caption, accounts, allAccounts, balances }: AccountTableProps) {
  return (
    <DataTable caption={caption}>
      <AccountsHead />
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
      <td className="text-right">
        {formatAmount(account.openingBalance, account.currency, locale)}
      </td>
      <td className="text-right">
        {formatAmount(balance, account.currency, locale)}
      </td>
      <td className="text-right">
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
