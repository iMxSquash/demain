import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getLocale, getTimeZone, getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

import { DataTable, Pill } from "../../../../components/data-display";
import { PageSection } from "../../../../components/page-section";
import { SkeletonFields, SkeletonLine, SkeletonRegion } from "../../../../components/skeleton";
import { formatAmount, formatEditableAmount } from "../../../../domain/money";
import { formatTolerancePercent, versionInEffectAt } from "../../../../domain/planned-item";
import { formatCalendarDate, todayIn } from "../../../../i18n/dates";
import { listAccounts } from "../../../../ledger/accounts";
import { listCategories } from "../../../../ledger/categories";
import { getPlannedItem, PlannedItemNotFoundError } from "../../../../ledger/planned-items";
import { withDatabase } from "../../../../storage/with-database";
import { requireSession } from "../../../auth/session";
import { ConfirmActionButton } from "../../../confirm-action-button";
import {
  addPlannedItemVersionAction,
  cancelPlannedItemAction,
  setPlannedItemEndDateAction,
  updatePlannedItemAction,
} from "../../actions";
import { DEFAULT_REPETITION, TRANSFER_KIND } from "../../planned-item-form-data";
import { PlannedItemDetailsForm } from "../../planned-item-details-form";
import { PlannedItemEndDateForm } from "../../planned-item-end-date-form";
import { PlannedItemVersionForm } from "../../planned-item-version-form";
import {
  accountTextOf,
  categoryOptionsOf,
  scheduleText,
  versionScheduleText,
} from "../../planned-item-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("planned");
  return { title: t("editMetaTitle") };
}

const PAGE_GAP = "gap-6";

// The back link shows at once; the title holds the name of the item, so it waits for the database
// with the form.
export default async function EditPlannedItemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const t = await getTranslations("planned");

  return (
    <main className={`mx-auto flex max-w-3xl flex-col ${PAGE_GAP} p-8`}>
      <Link href="/planned" className="self-start underline">
        {t("backToPlanned")}
      </Link>
      <Suspense fallback={<EditPlannedItemLoading />}>
        <EditPlannedItem params={params} />
      </Suspense>
    </main>
  );
}

function EditPlannedItemLoading() {
  const loading = useTranslations("loading");

  return (
    <SkeletonRegion label={loading("form")} className={`flex flex-col ${PAGE_GAP}`}>
      <SkeletonLine size="heading" width="1/3" />
      <SkeletonFields count={3} />
    </SkeletonRegion>
  );
}

async function EditPlannedItem({ params }: { params: Promise<{ id: string }> }) {
  await requireSession();
  // The id comes from the URL, which the shared App Shell cannot hold: it is read here.
  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isSafeInteger(id)) notFound();
  // The page reads the database: it must run per request, never at build time.
  await connection();
  const [t, locale, timeZone] = await Promise.all([
    getTranslations("planned"),
    getLocale(),
    getTimeZone(),
  ]);
  const today = todayIn(timeZone, new Date());

  // The read of one record for a form stays uncached (ADR-023).
  let data;
  try {
    data = withDatabase((db) => ({
      item: getPlannedItem(db, id),
      accounts: listAccounts(db, { includeArchived: true }),
      categories: listCategories(db, { includeArchived: true }),
    }));
  } catch (error) {
    if (error instanceof PlannedItemNotFoundError) notFound();
    throw error;
  }
  const { item, accounts, categories } = data;

  const accountNames = new Map(accounts.map((account) => [account.id, account.name]));
  const currency = accounts.find((account) => account.id === item.accountId)?.currency ?? "";
  const inEffect = versionInEffectAt(item.versions, today);
  const isOneOff = item.versions.every((version) => version.repetitionKind === null);
  const scheduleOf = (version: (typeof item.versions)[number]) =>
    versionScheduleText((key, values) => t(key, values), locale, item.startDate, version);
  const facts = [
    { label: t("facts.kind"), value: t(`kinds.${item.kind}`) },
    {
      label: t("facts.account"),
      value: accountTextOf(item, accountNames, (names) => t("transferAccounts", names)),
    },
    { label: t("facts.startDate"), value: formatCalendarDate(item.startDate, locale) },
    {
      label: t("facts.schedule"),
      value: scheduleText((key, values) => t(key, values), locale, item, today),
    },
  ];
  // A repeating item whose version in effect is one-off still offers a repeating choice to start from.
  const versionFormValues = {
    effectiveFrom: "",
    repetition: inEffect.repetitionKind === null ? DEFAULT_REPETITION : inEffect.repetitionKind,
    repetitionValue: inEffect.repetitionValue === null ? "" : String(inEffect.repetitionValue),
    businessDayRule: inEffect.businessDayRule,
    amount: formatEditableAmount(Math.abs(inEffect.amount), currency),
  };
  // The key remounts a form when the data it is pre-filled from changes after a save.
  const versionFormKey = Object.values(versionFormValues).join("|");

  return (
    <>
      <h1 className="text-heading font-medium">{t("editTitle", { name: item.name })}</h1>
      <PageSection id="summary-heading" heading={t("summaryHeading")}>
        <dl className="grid max-w-md grid-cols-[max-content_1fr] gap-x-6 gap-y-1">
          {facts.map((fact) => (
            <div key={fact.label} className="contents">
              <dt className="text-text-muted">{fact.label}</dt>
              <dd>{fact.value}</dd>
            </div>
          ))}
        </dl>
        {item.cancelled ? (
          <p>
            <Pill>{t("cancelled")}</Pill>
          </p>
        ) : null}
      </PageSection>

      <PageSection id="versions-heading" heading={t("versions.heading")}>
        <DataTable caption={t("versions.caption")}>
          <thead>
            <tr>
              <th scope="col">{t("versions.columns.effectiveFrom")}</th>
              <th scope="col">{t("versions.columns.schedule")}</th>
              <th scope="col">{t("versions.columns.businessDay")}</th>
              <th scope="col" className="text-right">{t("versions.columns.amount")}</th>
              <th scope="col">{t("versions.columns.status")}</th>
            </tr>
          </thead>
          <tbody>
            {item.versions.map((version) => (
              <tr key={version.effectiveFrom}>
                <th scope="row">{formatCalendarDate(version.effectiveFrom, locale)}</th>
                <td>{scheduleOf(version)}</td>
                <td>{t(`form.businessDayRules.${version.businessDayRule}`)}</td>
                <td className="text-right">{formatAmount(version.amount, currency, locale)}</td>
                <td>
                  {version.effectiveFrom > today ? (
                    <Pill>{t("versions.upcoming")}</Pill>
                  ) : version === inEffect ? (
                    <Pill>{t("versions.inEffect")}</Pill>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </PageSection>

      {item.cancelled ? null : (
        <>
          <PageSection id="version-form-heading" heading={t("versionForm.heading")}>
            <PlannedItemVersionForm
              key={versionFormKey}
              action={addPlannedItemVersionAction.bind(null, item.id)}
              initialValues={versionFormValues}
              isOneOff={isOneOff}
            />
          </PageSection>

          {isOneOff ? null : (
            <PageSection id="end-date-heading" heading={t("endDateForm.heading")}>
              <PlannedItemEndDateForm
                key={item.endDate ?? "none"}
                action={setPlannedItemEndDateAction.bind(null, item.id)}
                initialValues={{ endDate: item.endDate ?? "" }}
              />
            </PageSection>
          )}
        </>
      )}

      <PageSection id="details-heading" heading={t("detailsHeading")}>
        <PlannedItemDetailsForm
          action={updatePlannedItemAction.bind(null, item.id)}
          initialValues={{
            name: item.name,
            categoryId: item.categoryId === null ? "" : String(item.categoryId),
            matchWindowDays: String(item.matchWindowDays),
            matchTolerancePercent: formatTolerancePercent(item.matchAmountToleranceBp),
          }}
          categories={categoryOptionsOf(categories, item.categoryId, (name) =>
            t("categoryArchived", { name }),
          )}
          hasCategory={item.kind !== TRANSFER_KIND}
        />
      </PageSection>

      {item.cancelled ? null : (
        <PageSection id="cancel-heading" heading={t("cancel.heading")}>
          <ConfirmActionButton
            action={cancelPlannedItemAction.bind(null, item.id)}
            label={t("cancel.label")}
            subject={item.name}
            title={t("cancel.title", { name: item.name })}
            message={t("cancel.message")}
            confirmLabel={t("cancel.confirm")}
            variant="destructive"
            className="self-start"
          />
        </PageSection>
      )}
    </>
  );
}
