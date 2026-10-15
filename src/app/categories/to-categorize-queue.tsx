import { getLocale, getTranslations } from "next-intl/server";

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

export async function ToCategorizeQueue({
  queue,
  accounts,
  categories,
}: ToCategorizeQueueProps) {
  const [t, locale] = await Promise.all([
    getTranslations("categories"),
    getLocale(),
  ]);
  if (queue.length === 0) {
    return <p>{t("queueEmpty")}</p>;
  }
  const accountById = new Map(accounts.map((account) => [account.id, account]));

  return (
    <table className="w-full border-collapse text-left">
      <thead>
        <tr className="border-b border-neutral-500">
          <th scope="col" className="py-2 pr-4">{t("columns.date")}</th>
          <th scope="col" className="py-2 pr-4">{t("columns.account")}</th>
          <th scope="col" className="py-2 pr-4">{t("columns.label")}</th>
          <th scope="col" className="py-2 pr-4 text-right">{t("columns.amount")}</th>
          <th scope="col" className="py-2">{t("columns.category")}</th>
        </tr>
      </thead>
      <tbody>
        {queue.map((row) => {
          const account = accountById.get(row.accountId);
          if (account === undefined) {
            throw new Error(
              `Transaction ${row.id} points to unknown account ${row.accountId}`,
            );
          }
          return (
            <tr key={row.id} className="border-b border-neutral-300">
              <td className="py-2 pr-4 tabular-nums">
                <time dateTime={row.date}>
                  {formatCalendarDate(row.date, locale)}
                </time>
              </td>
              <td className="py-2 pr-4">{account.name}</td>
              <th scope="row" className="py-2 pr-4 font-medium">
                {row.label}
              </th>
              <td className="py-2 pr-4 text-right tabular-nums">
                {formatAmount(row.amount, account.currency, locale)}
              </td>
              <td className="py-2">
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
    </table>
  );
}
