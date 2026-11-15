import { getLocale, getTranslations } from "next-intl/server";

import { DataTable, NUMBER_CELL, Pill } from "../../components/data-display";
import { gapDirection } from "../../domain/balance-assertion";
import { formatAmount } from "../../domain/money";
import type { AccountBalanceAssertion } from "../../ledger/balance-assertions";
import { ConfirmActionButton } from "../confirm-action-button";
import { deleteBalanceAssertionAction } from "../accounts/[id]/balances/actions";

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
    <DataTable caption={caption}>
      <thead>
        <tr>
          <th scope="col">{t("columns.date")}</th>
          {showAccount ? (
            <th scope="col">{t("accountColumn")}</th>
          ) : null}
          <th scope="col" className="text-right">{t("columns.asserted")}</th>
          <th scope="col" className="text-right">{t("columns.computed")}</th>
          <th scope="col">{t("columns.gap")}</th>
          <th scope="col">{t("columns.note")}</th>
          <th scope="col">{t("columns.actions")}</th>
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
            <tr key={assertion.id}>
              <th scope="row" className="tabular-nums">
                <time dateTime={assertion.date}>{assertion.date}</time>
              </th>
              {showAccount ? (
                <td>
                  {assertion.accountName}
                  {assertion.accountArchived ? (
                    <>
                      {" "}
                      <Pill>{t("archivedAccount")}</Pill>
                    </>
                  ) : null}
                </td>
              ) : null}
              <td className={NUMBER_CELL}>{money(assertion.amount)}</td>
              <td className={NUMBER_CELL}>{money(assertion.computedBalance)}</td>
              <td className="tabular-nums">
                {direction === "equal"
                  ? t("gapNone")
                  : `${money(assertion.gap)} (${t(GAP_SENTENCE_KEY[direction])})`}
              </td>
              <td>{assertion.note}</td>
              <td>
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
    </DataTable>
  );
}
