import { getLocale, getTranslations } from "next-intl/server";

import { gapDirection } from "../../domain/balance-assertion";
import { formatAmount } from "../../domain/money";
import type { AccountBalanceAssertion } from "../../ledger/balance-assertions";
import { ConfirmActionButton } from "../confirm-action-button";
import { deleteBalanceAssertionAction } from "../accounts/[id]/balances/actions";

const NUMBER_HEADER = "py-2 pr-4 text-right";
const NUMBER_CELL = "py-2 pr-4 text-right tabular-nums";

const GAP_SENTENCE_KEY = {
  realAbove: "gapBankHigher",
  realBelow: "gapDemainHigher",
} as const;

interface BalanceAssertionsTableProps {
  assertions: readonly AccountBalanceAssertion[];
  caption: string;
  /** Adds the account column: the table then lists several accounts. */
  showAccount: boolean;
}

/**
 * The recorded balances with their gap. The gap is a sentence and a signed
 * amount, never a color, and an archived account has no delete button.
 */
export async function BalanceAssertionsTable({
  assertions,
  caption,
  showAccount,
}: BalanceAssertionsTableProps) {
  const [t, locale] = await Promise.all([
    getTranslations("balances"),
    getLocale(),
  ]);

  return (
    // A focusable region: the table is wider than a phone, and keyboard
    // users must be able to scroll it.
    <div
      role="region"
      aria-label={t("regionLabel")}
      tabIndex={0}
      className="relative overflow-x-auto"
    >
      <table className="w-full border-collapse text-left">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-neutral-500">
            <th scope="col" className="py-2 pr-4">{t("columns.date")}</th>
            {showAccount ? (
              <th scope="col" className="py-2 pr-4">{t("accountColumn")}</th>
            ) : null}
            <th scope="col" className={NUMBER_HEADER}>{t("columns.asserted")}</th>
            <th scope="col" className={NUMBER_HEADER}>{t("columns.computed")}</th>
            <th scope="col" className="py-2 pr-4">{t("columns.gap")}</th>
            <th scope="col" className="py-2 pr-4">{t("columns.note")}</th>
            <th scope="col" className="py-2">{t("columns.actions")}</th>
          </tr>
        </thead>
        <tbody>
          {assertions.map((assertion) => {
            const money = (minorUnits: number) =>
              formatAmount(minorUnits, assertion.accountCurrency, locale);
            const direction = gapDirection(
              assertion.computedBalance,
              assertion.amount,
            );
            return (
              <tr key={assertion.id} className="border-b border-neutral-300">
                <th scope="row" className="py-2 pr-4 font-medium tabular-nums">
                  <time dateTime={assertion.date}>{assertion.date}</time>
                </th>
                {showAccount ? (
                  <td className="py-2 pr-4">
                    {assertion.accountName}
                    {assertion.accountArchived ? ` (${t("archivedAccount")})` : null}
                  </td>
                ) : null}
                <td className={NUMBER_CELL}>{money(assertion.amount)}</td>
                <td className={NUMBER_CELL}>{money(assertion.computedBalance)}</td>
                <td className="py-2 pr-4 tabular-nums">
                  {direction === "equal"
                    ? t("gapNone")
                    : `${money(assertion.gap)} (${t(GAP_SENTENCE_KEY[direction])})`}
                </td>
                <td className="py-2 pr-4">{assertion.note}</td>
                <td className="py-2">
                  {assertion.accountArchived ? null : (
                    <ConfirmActionButton
                      action={deleteBalanceAssertionAction.bind(
                        null,
                        assertion.accountId,
                        assertion.id,
                      )}
                      label={t("delete")}
                      subject={showAccount ? `${assertion.accountName} ${assertion.date}` : assertion.date}
                      title={t("deleteTitle", { date: assertion.date })}
                      message={t("deleteMessage")}
                      confirmLabel={t("deleteConfirm")}
                    />
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
