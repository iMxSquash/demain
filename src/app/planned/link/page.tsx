import { CaretLeft } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getLocale, getTimeZone, getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { Button } from "../../../components/button";
import { EmptyState, Pill } from "../../../components/data-display";
import { DatePicker } from "../../../components/date-picker";
import { Icon } from "../../../components/icon";
import { SkeletonBlock, SkeletonRegion } from "../../../components/skeleton";
import { formatAmount } from "../../../domain/money";
import { monthOf } from "../../../domain/synthesis";
import { formatCalendarDate, formatFullCalendarDate, todayIn } from "../../../i18n/dates";
import { getAccount } from "../../../ledger/accounts";
import {
  listOccurrenceLinkCandidates,
  PlannedLinkError,
  type LinkFilters,
  type OccurrenceRef,
} from "../../../ledger/planned-matching";
import { withDatabase } from "../../../storage/with-database";
import { requireRequest } from "../../auth/require-request";
import { tagDataRead } from "../../data-cache";
import { CONTROL_CLASS, FormField } from "../../form-field";
import {
  calendarHref,
  LINK_ROUTE,
  parseBackView,
  parseLinkFilters,
  parseOccurrenceRef,
  shownBound,
  type CalendarBackView,
} from "../link-params";
import { LinkTransactionList } from "./link-transaction-list";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const LINK_CLASS = "inline-flex min-h-11 items-center gap-2 rounded-pill px-2 font-medium hover:bg-control";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("planned.link");
  return { title: t("metaTitle") };
}

// Plain data only: the arguments are the cache key. A refusal is data too, so it is cached with the rest.
async function readCandidates(ref: OccurrenceRef, today: string, filters: Required<LinkFilters>) {
  "use cache";
  tagDataRead();
  return withDatabase((db) => {
    try {
      const result = listOccurrenceLinkCandidates(db, ref, today, filters);
      const { name } = getAccount(db, result.occurrence.accountId);
      return { ...result, accountName: name };
    } catch (error) {
      if (error instanceof PlannedLinkError) return null;
      throw error;
    }
  });
}

/** The back link and the heading come first, so that leaving never means crossing a long list. */
export default function LinkTransactionPage({ searchParams }: { searchParams: SearchParams }) {
  const t = useTranslations("planned.link");

  return (
    <main className="@container mx-auto flex max-w-5xl flex-col p-8">
      <Suspense fallback={<span className="block h-11" />}>
        <BackLink searchParams={searchParams} />
      </Suspense>
      <h1 className="mt-3 text-heading font-medium">{t("title")}</h1>
      <Suspense fallback={<LinkLoading />}>
        <LinkContent searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

function LinkLoading() {
  const t = useTranslations("planned.link");

  return (
    <SkeletonRegion label={t("loadingLabel")} className="mt-4 flex flex-col gap-6">
      <SkeletonBlock className="h-20 rounded-card" />
      <SkeletonBlock className="h-64 rounded-card" />
    </SkeletonRegion>
  );
}

interface PageParams {
  ref: OccurrenceRef;
  back: CalendarBackView;
  filters: Required<LinkFilters>;
  params: Record<string, string | string[] | undefined>;
}

async function readParams(searchParams: SearchParams): Promise<PageParams> {
  const [params] = await Promise.all([searchParams, requireRequest()]);
  const ref = parseOccurrenceRef(params.item, params.date);
  if (ref === null) notFound();
  return { ref, back: parseBackView(params.back), filters: parseLinkFilters(params), params };
}

async function BackLink({ searchParams }: { searchParams: SearchParams }) {
  const [t, { ref, back }] = await Promise.all([getTranslations("planned.link"), readParams(searchParams)]);

  return (
    <Link href={calendarHref(back, monthOf(ref.nominalDate))} className={`${LINK_CLASS} self-start`}>
      <Icon icon={CaretLeft} />
      {t("back")}
    </Link>
  );
}

async function LinkContent({ searchParams }: { searchParams: SearchParams }) {
  const [t, statuses, locale, timeZone, page] = await Promise.all([
    getTranslations("planned.link"),
    getTranslations("calendar.lines.statuses"),
    getLocale(),
    getTimeZone(),
    readParams(searchParams),
  ]);
  const data = await readCandidates(page.ref, todayIn(timeZone, new Date()), page.filters);
  if (data === null) {
    return (
      <div className="mt-6">
        <EmptyState>{t("unavailable")}</EmptyState>
      </div>
    );
  }

  const { occurrence, range, transactions, accountName } = data;
  const format = (minorUnits: number) => formatAmount(minorUnits, occurrence.currency, locale);
  const due = formatCalendarDate(occurrence.date, locale);
  const rows = transactions.map((transaction) => {
    const date = formatCalendarDate(transaction.date, locale);
    const amount = format(transaction.amount);
    return {
      id: transaction.id,
      date,
      label: transaction.label,
      account: accountName,
      amount,
      buttonLabel: t("linkLabel", { transaction: transaction.label, date, amount, name: occurrence.name, due }),
    };
  });

  return (
    <>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-3 rounded-card border border-dashed border-border-control bg-surface p-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{occurrence.name}</span>
            <Pill tone={occurrence.status === "overdue" ? "warning" : "neutral"}>{statuses(occurrence.status)}</Pill>
          </div>
          <p className="mt-1 text-caption text-text-muted">
            {t("where", {
              account: accountName,
              planned: t("plannedFor", { date: formatFullCalendarDate(occurrence.date, locale) }),
            })}
          </p>
        </div>
        <p className="flex items-baseline gap-3 text-text-muted tabular-nums">
          <span className="text-caption font-medium">{t("planned")}</span>
          <span>{format(occurrence.amount)}</span>
        </p>
      </div>

      <form
        method="get"
        action={LINK_ROUTE}
        role="search"
        aria-label={t("filtersLabel")}
        className="mt-6 grid grid-cols-1 items-end gap-4 @min-[768px]:grid-cols-[minmax(0,1fr)_176px_176px_auto]"
      >
        <input type="hidden" name="item" value={page.ref.plannedItemId} />
        <input type="hidden" name="date" value={page.ref.nominalDate} />
        <input type="hidden" name="back" value={page.back} />
        <FormField id="link-search" label={t("search")}>
          <input
            id="link-search"
            name="q"
            type="text"
            autoComplete="off"
            placeholder={t("searchPlaceholder")}
            defaultValue={page.filters.search}
            className={CONTROL_CLASS}
          />
        </FormField>
        <FormField id="link-from" label={t("from")}>
          <DatePicker id="link-from" name="from" defaultValue={shownBound(range.from)} />
        </FormField>
        <FormField id="link-to" label={t("to")}>
          <DatePicker id="link-to" name="to" defaultValue={shownBound(range.to)} />
        </FormField>
        <Button type="submit" variant="secondary">
          {t("show")}
        </Button>
      </form>

      <p role="status" className="mt-6 mb-3 text-caption text-text-muted">
        {t("count", { count: rows.length })}
      </p>
      {rows.length === 0 ? (
        <EmptyState>{t("empty")}</EmptyState>
      ) : (
        <LinkTransactionList
          itemId={page.ref.plannedItemId}
          nominalDate={page.ref.nominalDate}
          back={page.back}
          // The month the back link opens too: that of the nominal date, known before any read.
          month={monthOf(page.ref.nominalDate)}
          caption={t("caption", { account: accountName, currency: occurrence.currency })}
          rows={rows}
        />
      )}
    </>
  );
}
