import { useTranslations } from "next-intl";

import {
  SkeletonDataTable,
  SkeletonFields,
  SkeletonRegion,
} from "../../components/skeleton";

export default function Loading() {
  const t = useTranslations("accounts");
  const tLoading = useTranslations("loading");
  const common = useTranslations("common");

  return (
    <SkeletonRegion
      as="main"
      label={tLoading("accounts")}
      className="mx-auto flex max-w-3xl flex-col gap-10 p-8"
    >
      <h1 className="text-heading font-medium">{t("title")}</h1>
      <section className="flex flex-col gap-3">
        <h2 className="text-title font-medium">{t("activeHeading")}</h2>
        <SkeletonDataTable
          caption={t("activeCaption")}
          headers={[
            { label: t("columns.name") },
            { label: t("columns.kind") },
            { label: t("columns.currency") },
            { label: t("columns.openingBalance"), end: true },
            { label: t("columns.balance"), end: true },
            { label: t("columns.depositCeiling"), end: true },
            { label: t("columns.overflowAccount") },
            { label: common("actions") },
          ]}
          rows={3}
        />
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="text-title font-medium">{t("addHeading")}</h2>
        <SkeletonFields count={4} />
      </section>
    </SkeletonRegion>
  );
}
