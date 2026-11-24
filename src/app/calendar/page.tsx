import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { EmptyState } from "../../components/data-display";
import { SkeletonBlock, SkeletonRegion } from "../../components/skeleton";
import { formatMonth } from "../../i18n/dates";
import {
  CalendarControls,
  CalendarHeading,
  calendarMetadata,
  loadCalendarPage,
  MONTH_HEADING_ID,
  viewHref,
  type SearchParams,
} from "./calendar-page";
import { linesTextOf } from "./lines/calendar-lines-text";
import { MonthGrid, type MonthGridText } from "./month-grid";

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  return calendarMetadata(searchParams, "grid");
}

export default function CalendarPage({ searchParams }: { searchParams: SearchParams }) {
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

  return (
    <SkeletonRegion label={t("grid.loadingLabel")}>
      <SkeletonBlock className="h-96 rounded-card" />
    </SkeletonRegion>
  );
}

async function CalendarData({ searchParams }: { searchParams: SearchParams }) {
  const [t, data] = await Promise.all([getTranslations("calendar"), loadCalendarPage(searchParams)]);
  const { calendar, accountNames, locale, today, month, selectedKey } = data;

  const text: MonthGridText = {
    label: formatMonth(month, locale),
    today: t("grid.today"),
    belowZero: t("grid.belowZero"),
    unplacedSurplus: t("grid.unplacedSurplus"),
    real: (count) => t("grid.real", { count }),
    planned: (count) => t("grid.planned", { count }),
    name: {
      today: t("grid.name.today"),
      balance: t("grid.name.balance"),
      noEntries: t("grid.name.noEntries"),
      belowZero: t("grid.name.belowZero"),
      unplacedSurplus: t("grid.name.unplacedSurplus"),
    },
    legend: t("grid.legend"),
  };

  return (
    <section aria-labelledby={MONTH_HEADING_ID} className="flex flex-col gap-4">
      <CalendarControls view="grid" {...data} />
      {calendar === null ? (
        <EmptyState action={{ href: "/accounts", label: t("noCheckingAction") }}>{t("noChecking")}</EmptyState>
      ) : (
        <MonthGrid
          month={calendar}
          locale={locale}
          today={today}
          linesHref={() => viewHref("lines", month, selectedKey)}
          text={text}
          details={{
            accounts: accountNames,
            lines: linesTextOf(t),
            text: { balance: t("grid.details.balance"), noEntries: t("grid.details.noEntries") },
          }}
        />
      )}
    </section>
  );
}
