import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import { formatAmount } from "../../domain/money";
import { monthOf } from "../../domain/synthesis";
import { listAccounts } from "../../ledger/accounts";
import { getMonthlySynthesis } from "../../ledger/synthesis";
import { withDatabase } from "../../storage/with-database";
import { DISPLAY_LOCALE } from "../display-locale";

export const metadata: Metadata = {
  title: "Monthly synthesis | Demain",
};

// Single reference currency until the multi-currency foundations land (#19).
const REFERENCE_CURRENCY = "EUR";
const NUMBER_HEADER = "py-2 pr-4 text-right";
const NUMBER_CELL = "py-2 pr-4 text-right tabular-nums";

export default async function SynthesisPage() {
  // The page reads the database and the clock: it must run per request.
  await connection();
  const throughMonth = monthOf(new Date().toISOString());
  const { accounts, months } = withDatabase((db) => ({
    accounts: listAccounts(db, { includeArchived: true }),
    months: getMonthlySynthesis(db, {
      referenceCurrency: REFERENCE_CURRENCY,
      throughMonth,
    }),
  }));
  const money = (minorUnits: number, currency = REFERENCE_CURRENCY) =>
    formatAmount(minorUnits, currency, DISPLAY_LOCALE);
  const unconverted = [
    ...new Set(months.flatMap((month) => month.unconvertedCurrencies)),
  ].sort();

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 p-8">
      <Link href="/" className="self-start underline">
        Back to home
      </Link>
      <h1 className="text-2xl font-semibold">Monthly synthesis</h1>

      {unconverted.length > 0 ? (
        <p role="status">
          Accounts in {unconverted.join(", ")} are shown in their own currency
          and left out of the totals and of the net and savings figures.
        </p>
      ) : null}

      {months.length === 0 ? (
        <p>
          Nothing to show yet. Add an account on the{" "}
          <Link href="/accounts" className="underline">
            accounts page
          </Link>{" "}
          first.
        </p>
      ) : (
        // A focusable region: the table is wider than a phone, and keyboard
        // users must be able to scroll it.
        <div
          role="region"
          aria-label="Monthly synthesis table"
          tabIndex={0}
          className="overflow-x-auto"
        >
          <table className="w-full border-collapse text-left">
            <caption className="sr-only">
              Net, savings, cumulative figures and end-of-month balances, month
              by month, in {REFERENCE_CURRENCY} unless stated.
            </caption>
            <thead>
              <tr className="border-b border-neutral-500">
                <th scope="col" className="py-2 pr-4">Month</th>
                <th scope="col" className={NUMBER_HEADER}>Net</th>
                <th scope="col" className={NUMBER_HEADER}>Savings</th>
                <th scope="col" className={NUMBER_HEADER}>Cumulative savings</th>
                <th scope="col" className={NUMBER_HEADER}>Cumulative account</th>
                {accounts.map((account) => (
                  <th key={account.id} scope="col" className={NUMBER_HEADER}>
                    {account.name}
                    {account.archived ? " (archived)" : ""}
                  </th>
                ))}
                <th scope="col" className="py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {months.map((month) => {
                const balanceOf = new Map(
                  month.balances.map((entry) => [entry.accountId, entry]),
                );
                return (
                  <tr key={month.month} className="border-b border-neutral-300">
                    <th scope="row" className="py-2 pr-4 font-medium tabular-nums">
                      {month.month}
                    </th>
                    <td className={NUMBER_CELL}>{money(month.net)}</td>
                    <td className={NUMBER_CELL}>{money(month.savings)}</td>
                    <td className={NUMBER_CELL}>
                      {money(month.cumulativeSavings)}
                    </td>
                    <td className={NUMBER_CELL}>
                      {money(month.cumulativeAccount)}
                    </td>
                    {accounts.map((account) => {
                      const entry = balanceOf.get(account.id);
                      return (
                        <td key={account.id} className={NUMBER_CELL}>
                          {entry === undefined
                            ? ""
                            : money(entry.balance, entry.currency)}
                        </td>
                      );
                    })}
                    <td className="py-2 text-right font-medium tabular-nums">
                      {money(month.total)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
