import { useTranslations } from "next-intl";
import Link from "next/link";

import {
  SkeletonDataTable,
  SkeletonFields,
  SkeletonRegion,
} from "../../components/skeleton";

export default function Loading() {
  const t = useTranslations("transactions");
  const tLoading = useTranslations("loading");
  const common = useTranslations("common");

  return (
    <SkeletonRegion
      as="main"
      label={tLoading("transactions")}
      className="mx-auto flex max-w-4xl flex-col gap-10 p-8"
    >
      <Link href="/" className="self-start underline">
        {common("backToHome")}
      </Link>
      <h1 className="text-heading font-medium">{t("title")}</h1>
      <section className="flex flex-col gap-3">
        <h2 className="text-title font-medium">{t("listHeading")}</h2>
        <SkeletonDataTable
          caption={t("caption")}
          headers={[
            { label: t("columns.date") },
            { label: t("columns.account") },
            { label: t("columns.label") },
            { label: t("columns.type") },
            { label: t("columns.category") },
            { label: t("columns.paymentMode") },
            { label: t("columns.amount"), end: true },
            { label: common("actions") },
          ]}
          rows={5}
        />
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="text-title font-medium">{t("addHeading")}</h2>
        <SkeletonFields count={4} />
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="text-title font-medium">{t("transferHeading")}</h2>
        <SkeletonFields count={3} />
      </section>
    </SkeletonRegion>
  );
}
