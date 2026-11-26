import { useTranslations } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";

import { DataTable, EmptyState } from "../../components/data-display";
import { formatAmount } from "../../domain/money";
import type { Account } from "../../ledger/accounts";
import type { Category } from "../../ledger/categories";
import type { Transaction } from "../../ledger/transactions";
import { formatCalendarDate } from "../../i18n/dates";
import { categorizeTransactionAction } from "./actions";
import { CategorizeForm } from "./categorize-form";

interface ToCategorizeQueueProps {
  queue: Transaction[];
  /** Every account, archived ones included: the queue holds their history too. */
  accounts: Account[];
  /** Active categories the user may pick. */
  categories: Category[];
}

/** The same `thead` for the queue and for its skeleton. */
export function ToCategorizeHead() {
  const t = useTranslations("categories");

  return (
    <thead>
      <tr>
        <th scope="col">{t("columns.date")}</th>
        <th scope="col">{t("columns.account")}</th>
        <th scope="col">{t("columns.label")}</th>
        <th scope="col" className="text-right">
          {t("columns.amount")}
        </th>
        <th scope="col">{t("columns.category")}</th>
      </tr>
    </thead>
  );
}

export async function ToCategorizeQueue({ queue, accounts, categories }: ToCategorizeQueueProps) {
  const [t, locale] = await Promise.all([getTranslations("categories"), getLocale()]);
  if (queue.length === 0) {
    return <EmptyState>{t("queueEmpty")}</EmptyState>;
  }
  const accountById = new Map(accounts.map((account) => [account.id, account]));

  return (
    <DataTable caption={t("queueCaption")}>
      <ToCategorizeHead />
      <tbody>
        {queue.map((row) => {
          const account = accountById.get(row.accountId);
          if (account === undefined) {
            throw new Error(`Transaction ${row.id} points to unknown account ${row.accountId}`);
          }
          return (
            <tr key={row.id}>
              <td className="tabular-nums">
                <time dateTime={row.date}>{formatCalendarDate(row.date, locale)}</time>
              </td>
              <td>{account.name}</td>
              <th scope="row">{row.label}</th>
              <td className="text-right">{formatAmount(row.amount, account.currency, locale)}</td>
              <td>
                <CategorizeForm
                  action={categorizeTransactionAction.bind(null, row.id)}
                  transactionLabel={row.label}
                  idPrefix={`queue-${row.id}`}
                  categories={categories}
                />
              </td>
            </tr>
          );
        })}
      </tbody>
    </DataTable>
  );
}
