import { CaretLeft, CaretRight } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getLocale, getTimeZone, getTranslations } from "next-intl/server";
import Link from "next/link";
import { connection } from "next/server";
import { cache, Suspense } from "react";

import { EmptyState } from "../../../components/data-display";
import { Icon } from "../../../components/icon";
import { SkeletonDataTable, SkeletonRegion } from "../../../components/skeleton";
import { addMonths } from "../../../domain/calendar-date";
import { monthOf } from "../../../domain/synthesis";
import { formatMonth, todayIn } from "../../../i18n/dates";
import { listAccounts } from "../../../ledger/accounts";
import { getCalendarMonth } from "../../../ledger/calendar";
import { getReferenceCurrency } from "../../../ledger/exchange-rates";
import { withDatabase } from "../../../storage/with-database";
import { requireSession } from "../../auth/session";
import { tagDataRead } from "../../data-cache";
import { FormField } from "../../form-field";
import { Button } from "../../../components/button";
import { Select } from "../../../components/select";
import {
  CalendarLinesHead,
  CalendarLinesTable,
  type CalendarLinesTableText,
} from "./calendar-lines-table";
import {
  CHECKING_KEY,
  parseAccountParam,
  parseMonthParam,
  selectAccounts,
  type SelectableAccount,
} from "./calendar-lines-params";

const ROUTE = "/calendar/lines";
const ACCOUNT_FIELD_ID = "calendar-account";
const MONTH_HEADING_ID = "calendar-month";
const SKELETON_ROWS = 6;
const NAV_LINK_CLASS =
  "inline-flex size-11 items-center justify-center rounded-pill transition-colors hover:bg-control";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

// The month depends on `searchParams`, which Cache Components only allows at request time: the
// title is the static one when the month is missing or invalid, so that it never needs the clock.
export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const [t, locale, params] = await Promise.all([getTranslations("calendar"), getLocale(), searchParams]);
  const month = parseMonthParam(params.month, "");
  return { title: month === "" ? t("metaTitle") : t("metaTitleMonth", { month: formatMonth(month, locale) }) };
}

// Once per request: the page is read per request, never at build time (ADR-023).
const requireRequest = cache(async () => {
  await requireSession();
  await connection();
});

// Only serialisable arguments: they are the cache key. Plain data comes out, never JSX or text.
async function readCalendar(month: string, today: string, accountKey: string) {
  "use cache";
  tagDataRead();
  return withDatabase((db) => {
    const accounts = listAccounts(db, { includeArchived: true });
    const selectable: SelectableAccount[] = accounts
      .filter((account) => !account.archived)
      .map(({ id, name, kind, currency }) => ({ id, name, kind, currency }));
    const referenceCurrency = getReferenceCurrency(db);
    const selection = selectAccounts(accountKey, selectable, referenceCurrency);
    return {
      calendar:
        selection.accountIds.length === 0
          ? null
          : getCalendarMonth(db, { month, today, accountIds: selection.accountIds, currency: selection.currency }),
      selectable,
      accountNames: accounts.map(({ id, name }) => ({ id, name })),
      referenceCurrency,
      selectedKey: selection.key,
    };
  });
}

export default async function CalendarLinesPage({ searchParams }: { searchParams: SearchParams }) {
  const t = await getTranslations("calendar");

  return (
    <main className="@container mx-auto flex max-w-5xl flex-col gap-4 p-8">
      <h1 className="text-heading font-medium">{t("title")}</h1>
      <Suspense fallback={<CalendarLoading />}>
        <CalendarData searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

// The skeleton and the table share their headings, so a column is added in one place.
function columnsText(
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

function CalendarLoading() {
  const t = useTranslations("calendar");
  const loading = useTranslations("loading");

  return (
    <SkeletonRegion label={loading("table")}>
      <SkeletonDataTable
        caption={t("lines.loadingCaption")}
        head={
          <CalendarLinesHead
            columns={columnsText(t)}
          />
        }
        columns={["start", "start", "start", "start", "start", "end", "end"]}
        rows={SKELETON_ROWS}
      />
    </SkeletonRegion>
  );
}

function hrefOf(month: string, accountKey: string): string {
  return `${ROUTE}?${new URLSearchParams({ month, account: accountKey })}`;
}

const monthOffset = (month: string, offset: number) => monthOf(addMonths(`${month}-01`, offset));

async function CalendarData({ searchParams }: { searchParams: SearchParams }) {
  const [t, locale, timeZone, params] = await Promise.all([
    getTranslations("calendar"),
    getLocale(),
    getTimeZone(),
    searchParams,
    requireRequest(),
  ]);
  // Read after the request is known, and outside the cached read: a cached "today" would go stale.
  const today = todayIn(timeZone, new Date());
  const month = parseMonthParam(params.month, monthOf(today));
  const { calendar, selectable, accountNames, referenceCurrency, selectedKey } = await readCalendar(
    month,
    today,
    parseAccountParam(params.account),
  );
  const previous = monthOffset(month, -1);
  const next = monthOffset(month, 1);
  const monthName = formatMonth(month, locale);

  const text: CalendarLinesTableText = {
    caption: t("lines.caption", { month: monthName }),
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

  return (
    <section aria-labelledby={MONTH_HEADING_ID} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex items-center">
          <Link
            href={hrefOf(previous, selectedKey)}
            aria-label={t("previousMonth", { month: formatMonth(previous, locale) })}
            className={NAV_LINK_CLASS}
          >
            <Icon icon={CaretLeft} />
          </Link>
          <h2
            id={MONTH_HEADING_ID}
            aria-live="polite"
            className="min-w-40 text-center text-title font-medium"
          >
            {monthName}
          </h2>
          <Link
            href={hrefOf(next, selectedKey)}
            aria-label={t("nextMonth", { month: formatMonth(next, locale) })}
            className={NAV_LINK_CLASS}
          >
            <Icon icon={CaretRight} />
          </Link>
        </div>
        <form method="get" action={ROUTE} className="flex w-full items-end gap-2 @min-[640px]:ml-auto @min-[640px]:w-auto">
          <input type="hidden" name="month" value={month} />
          <div className="min-w-0 flex-1 @min-[640px]:w-70 @min-[640px]:flex-none">
            <FormField id={ACCOUNT_FIELD_ID} label={t("accountLabel")} hint={t("accountHint")}>
              <Select key={selectedKey} id={ACCOUNT_FIELD_ID} name="account" defaultValue={selectedKey}>
                <option value={CHECKING_KEY}>{t("checkingOption", { currency: referenceCurrency })}</option>
                {selectable.map((account) => (
                  <option key={account.id} value={String(account.id)}>
                    {t("accountOption", { name: account.name, currency: account.currency })}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>
          <Button type="submit" variant="secondary">
            {t("show")}
          </Button>
        </form>
      </div>
      {calendar === null ? (
        <EmptyState action={{ href: "/accounts", label: t("noCheckingAction") }}>{t("noChecking")}</EmptyState>
      ) : (
        <CalendarLinesTable month={calendar} accounts={accountNames} locale={locale} text={text} />
      )}
    </section>
  );
}
