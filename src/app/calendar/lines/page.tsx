import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { EmptyState } from "../../../components/data-display";
import { SkeletonDataTable, SkeletonRegion } from "../../../components/skeleton";
import { formatMonth } from "../../../i18n/dates";
import {
  calendarMetadata,
  CalendarControls,
  CalendarHeading,
  loadCalendarPage,
  MONTH_HEADING_ID,
  type SearchParams,
} from "../calendar-page";
import { CalendarLinesHead, CalendarLinesTable } from "./calendar-lines-table";
import { columnsText, linesTextOf } from "./calendar-lines-text";

const SKELETON_ROWS = 6;

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  return calendarMetadata(searchParams, "lines");
}

export default function CalendarLinesPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <main className="@container mx-auto flex max-w-5xl flex-col gap-4 p-8">
      <CalendarHeading />
      <Suspense fallback={<CalendarLoading />}>
        <CalendarData searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

function CalendarLoading() {
  const t = useTranslations("calendar");
  const loading = useTranslations("loading");

  return (
    <SkeletonRegion label={loading("table")}>
      <SkeletonDataTable
        caption={t("lines.loadingCaption")}
        head={
          <CalendarLinesHead columns={columnsText(t)} />
        }
        columns={["start", "start", "start", "start", "start", "end", "end", "start"]}
        rows={SKELETON_ROWS}
      />
    </SkeletonRegion>
  );
}

async function CalendarData({ searchParams }: { searchParams: SearchParams }) {
  const [t, data] = await Promise.all([getTranslations("calendar"), loadCalendarPage(searchParams)]);
  const { calendar, accountNames, locale, month } = data;

  return (
    <section aria-labelledby={MONTH_HEADING_ID} className="flex flex-col gap-4">
      <CalendarControls view="lines" {...data} />
      {calendar === null ? (
        <EmptyState action={{ href: "/accounts", label: t("noCheckingAction") }}>{t("noChecking")}</EmptyState>
      ) : (
        <CalendarLinesTable
          month={calendar}
          accounts={accountNames}
          locale={locale}
          text={{ ...linesTextOf(t), caption: t("lines.caption", { month: formatMonth(month, locale) }) }}
        />
      )}
    </section>
  );
}

