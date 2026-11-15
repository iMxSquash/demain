import { useTranslations } from "next-intl";
import Link from "next/link";

import {
  SkeletonDataTable,
  SkeletonFields,
  SkeletonRegion,
} from "../../components/skeleton";

export default function Loading() {
  const t = useTranslations("balances");
  const tLoading = useTranslations("loading");
  const common = useTranslations("common");

  return (
    <SkeletonRegion
      as="main"
      label={tLoading("balances")}
      className="mx-auto flex max-w-4xl flex-col gap-8 p-8"
    >
      <Link href="/" className="self-start underline">
        {common("backToHome")}
      </Link>
      <h1 className="text-heading font-medium">{t("allTitle")}</h1>
      <p>{t("allIntro")}</p>
      <p>
        <Link href="/balances/summary" className="underline">
          {t("summaryLink")}
        </Link>
      </p>
      <section className="flex flex-col gap-3">
        <h2 className="text-title font-medium">{t("addHeading")}</h2>
        <SkeletonFields count={3} />
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="text-title font-medium">{t("listHeading")}</h2>
        <SkeletonDataTable
          caption={t("allCaption")}
          regionLabel={t("regionLabel")}
          headers={[
            { label: t("columns.date") },
            { label: t("accountColumn") },
            { label: t("columns.asserted"), end: true },
            { label: t("columns.computed"), end: true },
            { label: t("columns.gap") },
            { label: t("columns.note") },
            { label: t("columns.actions") },
          ]}
          rows={3}
        />
      </section>
    </SkeletonRegion>
  );
}
