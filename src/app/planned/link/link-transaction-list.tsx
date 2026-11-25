"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";

import { Button } from "../../../components/button";
import { DataTable } from "../../../components/data-display";
import { linkTransactionToOccurrenceAction } from "../actions";
import type { CalendarBackView } from "../link-params";

/** One unlinked transaction, its text already formatted on the server. */
export interface LinkRow {
  id: number;
  date: string;
  label: string;
  account: string;
  amount: string;
  /** "Link, Pharmacy, 21 Nov 2026, -€18.50, to Internet due 20 Nov 2026". */
  buttonLabel: string;
}

export interface LinkTransactionListProps {
  itemId: number;
  nominalDate: string;
  back: CalendarBackView;
  /** YYYY-MM: the month the calendar opens on once linked. */
  month: string;
  caption: string;
  rows: readonly LinkRow[];
}

// The 640 px threshold of DESIGN section 18: the table and the stacked list swap at it.
const TABLE_CLASS = "hidden @min-[640px]:block";
const LIST_CLASS = "rounded-card bg-surface p-4 @min-[640px]:hidden";

type Hidden = Pick<LinkTransactionListProps, "itemId" | "nominalDate" | "back" | "month">;

interface LinkButtonProps {
  row: LinkRow;
  hidden: Hidden;
  formAction: (formData: FormData) => void;
  isPending: boolean;
  /** Only the button that was pressed says it is linking; every button holds while it runs. */
  isChosen: boolean;
  onChoose: () => void;
  className?: string;
}

function LinkButton({ row, hidden, formAction, isPending, isChosen, onChoose, className }: LinkButtonProps) {
  const t = useTranslations("planned.link");

  return (
    <form action={formAction}>
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <input type="hidden" name="transactionId" value={row.id} />
      <Button
        type="submit"
        variant="secondary"
        aria-label={row.buttonLabel}
        pending={isPending}
        pendingLabel={isChosen ? t("linkPending") : undefined}
        onClick={onChoose}
        className={className}
      >
        {t("link")}
      </Button>
    </form>
  );
}

/**
 * The transactions of the "Link a transaction" page, each with its Link button. A link sends the
 * user back to the calendar with a toast; a refusal stays here, one line above the list.
 */
export function LinkTransactionList({ itemId, nominalDate, back, month, caption, rows }: LinkTransactionListProps) {
  const t = useTranslations("planned.link");
  const common = useTranslations("common");
  const [error, formAction, isPending] = useActionState(linkTransactionToOccurrenceAction, null);
  const [chosenId, setChosenId] = useState<number | null>(null);
  const buttonOf = (row: LinkRow, className?: string) => (
    <LinkButton
      row={row}
      hidden={{ itemId, nominalDate, back, month }}
      formAction={formAction}
      isPending={isPending}
      isChosen={chosenId === row.id}
      onChoose={() => setChosenId(row.id)}
      className={className}
    />
  );

  return (
    <div className="flex flex-col gap-3">
      {error === null ? null : (
        <p role="alert" className="font-medium text-negative">
          {common("error", { message: error })}
        </p>
      )}
      <div className={TABLE_CLASS}>
        <DataTable caption={caption} hideCaption>
          <thead>
            <tr>
              <th scope="col">{t("columns.date")}</th>
              <th scope="col">{t("columns.description")}</th>
              <th scope="col">{t("columns.account")}</th>
              <th scope="col" className="text-right">
                {t("columns.amount")}
              </th>
              <th scope="col" className="text-right">
                <span className="sr-only">{t("columns.action")}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="tabular-nums">{row.date}</td>
                <th scope="row" className="font-regular! whitespace-normal!">
                  {row.label}
                </th>
                <td>{row.account}</td>
                <td className="text-right tabular-nums">{row.amount}</td>
                <td className="py-1 text-right">
                  {buttonOf(row)}
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </div>
      <div className={LIST_CLASS}>
        <h2 className="sr-only">{caption}</h2>
        <ul>
          {rows.map((row) => (
            <li key={row.id} className="border-t border-divider py-3 first:border-t-0 first:pt-0">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="w-18 flex-none text-caption text-text-muted">{row.date}</span>
                <span className="min-w-0 font-medium">{row.label}</span>
                <span className="ml-auto tabular-nums">{row.amount}</span>
              </div>
              <p className="mt-1 text-caption text-text-muted">{row.account}</p>
              <div className="mt-3">
                {buttonOf(row, "w-full")}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
