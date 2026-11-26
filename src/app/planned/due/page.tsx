import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getLocale, getTimeZone, getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { EmptyState, Pill } from "../../../components/data-display";
import { SkeletonBlock, SkeletonRegion } from "../../../components/skeleton";
import { formatEditableAmount } from "../../../domain/money";
import { DUE_SOON_DAYS } from "../../../domain/planned-matching";
import { formatCalendarDate, todayIn } from "../../../i18n/dates";
import { listAccounts } from "../../../ledger/accounts";
import { listDueOccurrences, type OpenOccurrence } from "../../../ledger/planned-matching";
import { withDatabase } from "../../../storage/with-database";
import { requireRequest } from "../../auth/require-request";
import { tagDataRead } from "../../data-cache";
import { MarkPaidCardForm, type MarkPaidButtonText } from "../mark-paid-form";
import { markPaidKindOf } from "../mark-paid-kind";

const HEADING_ID = "to-pay-heading";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("planned.due");
  return { title: t("metaTitle") };
}

// `today` is read outside the cache, so that the lists never go stale at midnight.
async function readDue(today: string) {
  "use cache";
  tagDataRead();
  return withDatabase((db) => ({
    ...listDueOccurrences(db, today),
    accounts: listAccounts(db, { includeArchived: true }).map(({ id, name }) => ({ id, name })),
  }));
}

export default function ToPayPage() {
  const t = useTranslations("planned.due");

  return (
    <main className="@container mx-auto flex max-w-5xl flex-col p-8">
      {/* The focus lands here when the last card leaves. */}
      <h1 id={HEADING_ID} tabIndex={-1} className="text-heading font-medium outline-none">
        {t("title")}
      </h1>
      <p className="mt-2 text-text-muted">{t("intro")}</p>
      <Suspense fallback={<ToPayLoading />}>
        <DueSections />
      </Suspense>
    </main>
  );
}

function ToPayLoading() {
  const t = useTranslations("planned.due");

  return (
    <SkeletonRegion label={t("loadingLabel")} className="mt-8 flex flex-col gap-3">
      <SkeletonBlock className="h-24 rounded-card" />
      <SkeletonBlock className="h-24 rounded-card" />
    </SkeletonRegion>
  );
}

type DueTranslator = Awaited<ReturnType<typeof getTranslations<"planned.due">>>;
type ActionsTranslator = Awaited<ReturnType<typeof getTranslations<"calendar.occurrenceActions">>>;
type StatusTranslator = Awaited<ReturnType<typeof getTranslations<"calendar.lines.statuses">>>;

interface CardText {
  due: DueTranslator;
  actions: ActionsTranslator;
  statuses: StatusTranslator;
  transferTo: (from: string, to: string) => string;
  locale: string;
  nameOf: (accountId: number) => string;
}

function buttonTextOf(
  occurrence: OpenOccurrence,
  subject: string,
  text: CardText,
): MarkPaidButtonText {
  const kind = markPaidKindOf(occurrence.kind);
  const label = text.actions(kind);
  return { label, ariaLabel: `${label}, ${subject}`, pendingLabel: text.actions(`${kind}Pending`) };
}

const buttonIdOf = ({ plannedItemId, nominalDate }: OpenOccurrence) =>
  `to-pay-${plannedItemId}-${nominalDate}`;

function DueCard({
  occurrence,
  next,
  text,
}: {
  occurrence: OpenOccurrence;
  next: OpenOccurrence | undefined;
  text: CardText;
}) {
  const { due, statuses, locale, nameOf } = text;
  const date = formatCalendarDate(occurrence.date, locale);
  const subject = due("subject", { name: occurrence.name, date });
  const account =
    occurrence.destinationAccountId === null
      ? nameOf(occurrence.accountId)
      : text.transferTo(nameOf(occurrence.accountId), nameOf(occurrence.destinationAccountId));

  return (
    <li>
      <MarkPaidCardForm
        itemId={occurrence.plannedItemId}
        nominalDate={occurrence.nominalDate}
        text={buttonTextOf(occurrence, subject, text)}
        initialValues={{
          date: occurrence.date,
          // Unsigned in the form: the type of the item gives the direction.
          amount: formatEditableAmount(Math.abs(occurrence.amount), occurrence.currency),
        }}
        dateLabel={due("date")}
        amountLabel={due(occurrence.status === "partial" ? "remainingAmount" : "amount")}
        fieldSubject={due("fieldSubject", { name: occurrence.name, date })}
        buttonId={buttonIdOf(occurrence)}
        focusAfterId={next === undefined ? HEADING_ID : buttonIdOf(next)}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{occurrence.name}</span>
          <Pill tone={occurrence.status === "overdue" ? "warning" : "neutral"}>
            {statuses(occurrence.status)}
          </Pill>
        </div>
        <p className="mt-1 text-caption text-text-muted">
          {due("where", { account, due: due("dueOn", { date }) })}
        </p>
      </MarkPaidCardForm>
    </li>
  );
}

function DueSection({
  id,
  heading,
  occurrences,
  nextOf,
  text,
}: {
  id: string;
  heading: string;
  occurrences: readonly OpenOccurrence[];
  nextOf: (occurrence: OpenOccurrence) => OpenOccurrence | undefined;
  text: CardText;
}) {
  // A section with nothing in it is not drawn (DESIGN section 18).
  if (occurrences.length === 0) return null;
  const headingId = `${id}-heading`;
  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId} className="mt-8 mb-4 text-title font-medium">
        {heading}
      </h2>
      <ul className="flex flex-col gap-3">
        {occurrences.map((occurrence) => (
          <DueCard
            key={buttonIdOf(occurrence)}
            occurrence={occurrence}
            next={nextOf(occurrence)}
            text={text}
          />
        ))}
      </ul>
    </section>
  );
}

async function DueSections() {
  const [due, actions, statuses, lines, locale, timeZone] = await Promise.all([
    getTranslations("planned.due"),
    getTranslations("calendar.occurrenceActions"),
    getTranslations("calendar.lines.statuses"),
    getTranslations("calendar.lines"),
    getLocale(),
    getTimeZone(),
    requireRequest(),
  ]);
  const data = await readDue(todayIn(timeZone, new Date()));
  if (data.due.length === 0 && data.soon.length === 0) {
    return (
      <div className="mt-8">
        <EmptyState>{due("empty")}</EmptyState>
      </div>
    );
  }

  const names = new Map(data.accounts.map(({ id, name }) => [id, name]));
  const text: CardText = {
    due,
    actions,
    statuses,
    transferTo: (from, to) => lines("transferTo", { from, to }),
    locale,
    nameOf: (accountId) => names.get(accountId) ?? String(accountId),
  };
  // The focus moves on to the next card in reading order, across the two sections.
  const ordered = [...data.due, ...data.soon];
  const nextOf = (occurrence: OpenOccurrence) => ordered[ordered.indexOf(occurrence) + 1];

  return (
    <>
      <DueSection
        id="due"
        heading={due("dueHeading")}
        occurrences={data.due}
        nextOf={nextOf}
        text={text}
      />
      <DueSection
        id="due-soon"
        heading={due("soonHeading", { count: DUE_SOON_DAYS })}
        occurrences={data.soon}
        nextOf={nextOf}
        text={text}
      />
    </>
  );
}
