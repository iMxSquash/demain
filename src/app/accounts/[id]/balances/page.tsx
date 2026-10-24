import type { Metadata } from "next";
import { getLocale, getTimeZone, getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { formatAmount } from "../../../../domain/money";
import { todayIn } from "../../../../i18n/dates";
import { AccountNotFoundError, getAccount } from "../../../../ledger/accounts";
import { listBalanceAssertions } from "../../../../ledger/balance-assertions";
import { withDatabase } from "../../../../storage/with-database";
import { requireSession } from "../../../auth/session";
import { ConfirmActionButton } from "../../../confirm-action-button";
import {
  deleteBalanceAssertionAction,
  saveBalanceAssertionAction,
} from "./actions";
import { BalanceAssertionForm } from "./balance-assertion-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("balances");
  return { title: t("metaTitle") };
}

const NUMBER_HEADER = "py-2 pr-4 text-right";
const NUMBER_CELL = "py-2 pr-4 text-right tabular-nums";

export default async function BalanceAssertionsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireSession();
  // The page reads the database and the clock: it must run per request.
  await connection();
  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isSafeInteger(id)) notFound();

  const [t, accountsT, locale, timeZone] = await Promise.all([
    getTranslations("balances"),
    getTranslations("accounts"),
    getLocale(),
    getTimeZone(),
  ]);

  let data;
  try {
    data = withDatabase((db) => ({
      account: getAccount(db, id),
      assertions: listBalanceAssertions(db, id),
    }));
  } catch (error) {
    if (error instanceof AccountNotFoundError) notFound();
    throw error;
  }
  const { account, assertions } = data;
  const money = (minorUnits: number) =>
    formatAmount(minorUnits, account.currency, locale);

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-8 p-8">
      <Link href="/accounts" className="self-start underline">
        {accountsT("backToAccounts")}
      </Link>
      <h1 className="text-2xl font-semibold">
        {t("title", { name: account.name })}
      </h1>
      <p>{t("intro")}</p>

      <section aria-labelledby="new-heading" className="flex flex-col gap-3">
        <h2 id="new-heading" className="text-xl font-semibold">
          {t("addHeading")}
        </h2>
        <BalanceAssertionForm
          action={saveBalanceAssertionAction.bind(null, account.id)}
          initialValues={{
            date: todayIn(timeZone, new Date()),
            amount: "",
            note: "",
          }}
        />
      </section>

      <section aria-labelledby="list-heading" className="flex flex-col gap-3">
        <h2 id="list-heading" className="text-xl font-semibold">
          {t("listHeading")}
        </h2>
        {assertions.length === 0 ? (
          <p>{t("empty")}</p>
        ) : (
          // A focusable region: the table is wider than a phone, and keyboard
          // users must be able to scroll it.
          <div
            role="region"
            aria-label={t("regionLabel")}
            tabIndex={0}
            className="overflow-x-auto"
          >
            <table className="w-full border-collapse text-left">
              <caption className="sr-only">
                {t("caption", { name: account.name })}
              </caption>
              <thead>
                <tr className="border-b border-neutral-500">
                  <th scope="col" className="py-2 pr-4">{t("columns.date")}</th>
                  <th scope="col" className={NUMBER_HEADER}>{t("columns.asserted")}</th>
                  <th scope="col" className={NUMBER_HEADER}>{t("columns.computed")}</th>
                  <th scope="col" className="py-2 pr-4">{t("columns.gap")}</th>
                  <th scope="col" className="py-2 pr-4">{t("columns.note")}</th>
                  <th scope="col" className="py-2">{t("columns.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {assertions.map((assertion) => (
                  <tr key={assertion.id} className="border-b border-neutral-300">
                    <th scope="row" className="py-2 pr-4 font-medium tabular-nums">
                      <time dateTime={assertion.date}>{assertion.date}</time>
                    </th>
                    <td className={NUMBER_CELL}>{money(assertion.amount)}</td>
                    <td className={NUMBER_CELL}>{money(assertion.computedBalance)}</td>
                    {/* The sign and a sentence carry the meaning, never a color. */}
                    <td className="py-2 pr-4 tabular-nums">
                      {assertion.gap === 0
                        ? t("gapNone")
                        : `${money(assertion.gap)} (${t(
                            assertion.gap > 0 ? "gapDemainHigher" : "gapBankHigher",
                          )})`}
                    </td>
                    <td className="py-2 pr-4">{assertion.note}</td>
                    <td className="py-2">
                      <ConfirmActionButton
                        action={deleteBalanceAssertionAction.bind(
                          null,
                          account.id,
                          assertion.id,
                        )}
                        label={t("delete")}
                        subject={assertion.date}
                        title={t("deleteTitle", { date: assertion.date })}
                        message={t("deleteMessage")}
                        confirmLabel={t("deleteConfirm")}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
