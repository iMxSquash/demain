import { formatAmount } from "../../domain/money";
import type { Account } from "../../ledger/accounts";
import type { Category } from "../../ledger/categories";
import type { Transaction } from "../../ledger/transactions";
import { DISPLAY_LOCALE } from "../display-locale";
import { categorizeTransactionAction } from "./actions";
import { CategorizeForm } from "./categorize-form";

interface ToCategorizeQueueProps {
  queue: Transaction[];
  /** Every account, archived ones included: the queue holds their history too. */
  accounts: Account[];
  /** Active categories the user may pick. */
  categories: Category[];
}

export function ToCategorizeQueue({
  queue,
  accounts,
  categories,
}: ToCategorizeQueueProps) {
  if (queue.length === 0) {
    return <p>Nothing to categorize: every transaction has a category.</p>;
  }
  const accountById = new Map(accounts.map((account) => [account.id, account]));

  return (
    <table className="w-full border-collapse text-left">
      <thead>
        <tr className="border-b border-neutral-500">
          <th scope="col" className="py-2 pr-4">Date</th>
          <th scope="col" className="py-2 pr-4">Account</th>
          <th scope="col" className="py-2 pr-4">Label</th>
          <th scope="col" className="py-2 pr-4 text-right">Amount</th>
          <th scope="col" className="py-2">Category</th>
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
              <td className="py-2 pr-4 tabular-nums">{row.date}</td>
              <td className="py-2 pr-4">{account.name}</td>
              <th scope="row" className="py-2 pr-4 font-medium">
                {row.label}
              </th>
              <td className="py-2 pr-4 text-right tabular-nums">
                {formatAmount(row.amount, account.currency, DISPLAY_LOCALE)}
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
