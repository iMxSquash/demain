import { CaretLeft, CaretRight } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getLocale, getTimeZone, getTranslations } from "next-intl/server";
import Link from "next/link";
import { Suspense } from "react";

import { Button } from "../../components/button";
import { Icon } from "../../components/icon";
import { Select } from "../../components/select";
import { addMonths } from "../../domain/calendar-date";
import { monthOf } from "../../domain/synthesis";
import { formatMonth, todayIn } from "../../i18n/dates";
import { listAccounts } from "../../ledger/accounts";
import { getCalendarMonth } from "../../ledger/calendar";
import { getReferenceCurrency } from "../../ledger/exchange-rates";
import { withDatabase } from "../../storage/with-database";
import { requireRequest } from "../auth/require-request";
import { tagDataRead } from "../data-cache";
import { readDueCount } from "../planned/due-count";
import { FormField } from "../form-field";
import {
  CHECKING_KEY,
  parseAccountParam,
  parseMonthParam,
  selectAccounts,
  type SelectableAccount,
} from "./lines/calendar-lines-params";

// What the two views of a month share: the data they read, the heading and the controls above them.

type CalendarView = "grid" | "lines";
export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const ROUTES: Record<CalendarView, string> = { grid: "/calendar", lines: "/calendar/lines" };
export const MONTH_HEADING_ID = "calendar-month";
const ACCOUNT_FIELD_ID = "calendar-account";
const LINK_CLASS = "inline-flex min-h-11 items-center rounded-pill px-3 font-medium hover:bg-control";
const NAV_LINK_CLASS =
  "inline-flex size-11 items-center justify-center rounded-pill transition-colors hover:bg-control";
const VIEW_ITEM_CLASS =
  "inline-flex min-h-11 min-w-22 items-center justify-center rounded-pill text-body font-medium transition-colors";

export function viewHref(view: CalendarView, month: string, accountKey: string): string {
  return `${ROUTES[view]}?${new URLSearchParams({ month, account: accountKey })}`;
}

const META_KEYS = {
  grid: { title: "gridMetaTitle", titleMonth: "gridMetaTitleMonth" },
  lines: { title: "metaTitle", titleMonth: "metaTitleMonth" },
} as const satisfies Record<CalendarView, { title: string; titleMonth: string }>;

const monthOffset = (month: string, offset: number) => monthOf(addMonths(`${month}-01`, offset));

// The month depends on `searchParams`, which Cache Components only allows at request time: the
// title is the static one when the month is missing or invalid, so that it never needs the clock.
export async function calendarMetadata(searchParams: SearchParams, view: CalendarView): Promise<Metadata> {
  const [t, locale, params] = await Promise.all([getTranslations("calendar"), getLocale(), searchParams]);
  const month = parseMonthParam(params.month, "");
  const { title, titleMonth } = META_KEYS[view];
  return { title: month === "" ? t(title) : t(titleMonth, { month: formatMonth(month, locale) }) };
}

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

/** The month, the account and the data of the page, once the request is known. */
export async function loadCalendarPage(searchParams: SearchParams) {
  const [locale, timeZone, params] = await Promise.all([getLocale(), getTimeZone(), searchParams, requireRequest()]);
  // Read after the request is known, and outside the cached read: a cached "today" would go stale.
  const today = todayIn(timeZone, new Date());
  const month = parseMonthParam(params.month, monthOf(today));
  const data = await readCalendar(month, today, parseAccountParam(params.account));
  return { ...data, locale, today, month };
}

const TO_PAY_HREF = "/planned/due";

// The count of the "Due" section, on every width: a column without the sidebar still has it.
async function ToPayLink() {
  const [t, timeZone] = await Promise.all([getTranslations("calendar"), getTimeZone(), requireRequest()]);
  const count = await readDueCount(todayIn(timeZone, new Date()));

  return (
    <Link href={TO_PAY_HREF} aria-label={t("toPayLinkLabel", { count })} className={LINK_CLASS}>
      {t("toPayLink", { count })}
    </Link>
  );
}

/** The `h1`, the way to the due occurrences and the way in to the planned items; both views have them. */
export function CalendarHeading() {
  const t = useTranslations("calendar");
  const navigation = useTranslations("navigation");

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
      <h1 className="text-heading font-medium">{t("title")}</h1>
      <div className="flex flex-wrap gap-1">
        {/* The count needs the request: the link is drawn without it until it is known. */}
        <Suspense
          fallback={
            <Link href={TO_PAY_HREF} className={LINK_CLASS}>
              {navigation("toPay")}
            </Link>
          }
        >
          <ToPayLink />
        </Suspense>
        <Link href="/planned" className={LINK_CLASS}>
          {t("plannedLink")}
        </Link>
      </div>
    </div>
  );
}

interface CalendarControlsProps {
  view: CalendarView;
  month: string;
  locale: string;
  selectedKey: string;
  selectable: readonly SelectableAccount[];
  referenceCurrency: string;
}

/** The month navigation, the switch between the views and the account form. */
export function CalendarControls({ view, month, locale, selectedKey, selectable, referenceCurrency }: CalendarControlsProps) {
  const t = useTranslations("calendar");
  const previous = monthOffset(month, -1);
  const next = monthOffset(month, 1);

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex items-center">
        <Link
          href={viewHref(view, previous, selectedKey)}
          aria-label={t("previousMonth", { month: formatMonth(previous, locale) })}
          className={NAV_LINK_CLASS}
        >
          <Icon icon={CaretLeft} />
        </Link>
        {/* The focus lands here when a changed occurrence leaves the page with its dialog. */}
        <h2
          id={MONTH_HEADING_ID}
          tabIndex={-1}
          data-focus-fallback=""
          aria-live="polite"
          className="min-w-40 text-center text-title font-medium"
        >
          {formatMonth(month, locale)}
        </h2>
        <Link
          href={viewHref(view, next, selectedKey)}
          aria-label={t("nextMonth", { month: formatMonth(next, locale) })}
          className={NAV_LINK_CLASS}
        >
          <Icon icon={CaretRight} />
        </Link>
      </div>
      <nav
        aria-label={t("viewLabel")}
        className="grid w-full grid-cols-2 gap-0.5 rounded-pill bg-control p-[3px] @min-[640px]:inline-flex @min-[640px]:w-auto"
      >
        {(["grid", "lines"] as const).map((target) => (
          <Link
            key={target}
            href={viewHref(target, month, selectedKey)}
            aria-current={target === view ? "page" : undefined}
            className={`${VIEW_ITEM_CLASS} ${
              target === view ? "bg-primary text-on-primary" : "text-text-muted hover:text-text"
            }`}
          >
            {t(target === "grid" ? "viewGrid" : "viewLines")}
          </Link>
        ))}
      </nav>
      <form
        method="get"
        action={ROUTES[view]}
        className="flex w-full items-end gap-2 @min-[640px]:ml-auto @min-[640px]:w-auto"
      >
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
  );
}
