import { useTranslations } from "next-intl";
import Link from "next/link";

import {
  SkeletonDataTable,
  SkeletonFields,
  SkeletonRegion,
} from "../../components/skeleton";

export default function Loading() {
  const t = useTranslations("currencies");
  const tLoading = useTranslations("loading");
  const common = useTranslations("common");

  return (
    <SkeletonRegion
      as="main"
      label={tLoading("currencies")}
      className="mx-auto flex max-w-4xl flex-col gap-8 p-8"
    >
      <Link href="/" className="self-start underline">
        {common("backToHome")}
      </Link>
      <h1 className="text-heading font-medium">{t("title")}</h1>
      <section className="flex flex-col gap-3">
        <h2 className="text-title font-medium">{t("referenceHeading")}</h2>
        <p>{t("referenceIntro")}</p>
        <SkeletonFields count={1} />
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="text-title font-medium">{t("ratesHeading")}</h2>
        <p>{t("ratesIntro")}</p>
        <h3 className="text-title font-medium">{t("addRateHeading")}</h3>
        <SkeletonFields count={3} />
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="text-title font-medium">{t("listHeading")}</h2>
        <SkeletonDataTable
          caption={t("caption")}
          regionLabel={t("regionLabel")}
          headers={[
            { label: t("columns.date") },
            { label: t("columns.pair") },
            { label: t("columns.rate"), end: true },
            { label: t("columns.source") },
            { label: t("columns.actions") },
          ]}
          rows={3}
        />
      </section>
    </SkeletonRegion>
  );
}
