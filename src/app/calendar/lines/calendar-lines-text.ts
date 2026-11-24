import type { getTranslations } from "next-intl/server";

import type { CalendarLinesTableText } from "./calendar-lines-table";

type CalendarTranslator = Awaited<ReturnType<typeof getTranslations<"calendar">>>;

// The skeleton and the table share their headings, so a column is added in one place.
export function columnsText(
  t: (key: `lines.columns.${keyof CalendarLinesTableText["columns"]}`) => string,
): CalendarLinesTableText["columns"] {
  return {
    date: t("lines.columns.date"),
    description: t("lines.columns.description"),
    account: t("lines.columns.account"),
    kind: t("lines.columns.kind"),
    status: t("lines.columns.status"),
    amount: t("lines.columns.amount"),
    balance: t("lines.columns.balance"),
  };
}

/** The texts of the lines of a month: the line view's table, and the details of a day of the grid. */
export function linesTextOf(t: CalendarTranslator): Omit<CalendarLinesTableText, "caption"> {
  return {
    columns: columnsText(t),
    kinds: { real: t("lines.kinds.real"), planned: t("lines.kinds.planned") },
    statuses: {
      planned: t("lines.statuses.planned"),
      partial: t("lines.statuses.partial"),
      confirmed: t("lines.statuses.confirmed"),
      overdue: t("lines.statuses.overdue"),
      cancelled: t("lines.statuses.cancelled"),
    },
    belowZero: t("lines.belowZero"),
    belowZeroFrom: (date) => t("lines.belowZeroFrom", { date }),
    unplacedSurplus: (amount, account) => t("lines.unplacedSurplus", { amount, account }),
    routingInvalid: t("lines.routingInvalid"),
    transferTo: (from, to) => t("lines.transferTo", { from, to }),
    empty: t("lines.empty"),
    unconverted: (currencies) => t("lines.unconverted", { currencies }),
  };
}
