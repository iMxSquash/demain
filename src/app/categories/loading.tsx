import { useTranslations } from "next-intl";
import Link from "next/link";

import {
  SkeletonFields,
  SkeletonRegion,
  SkeletonRows,
} from "../../components/skeleton";

export default function Loading() {
  const t = useTranslations("categories");
  const tLoading = useTranslations("loading");
  const common = useTranslations("common");

  return (
    <SkeletonRegion
      as="main"
      label={tLoading("categories")}
      className="mx-auto flex max-w-4xl flex-col gap-10 p-8"
    >
      <Link href="/" className="self-start underline">
        {common("backToHome")}
      </Link>
      <h1 className="text-heading font-medium">{t("title")}</h1>
      <section className="flex flex-col gap-3">
        <h2 className="text-title font-medium">{t("queueHeading")}</h2>
        <SkeletonRows columns={1} rows={3} rowClassName="min-h-14 border-b border-divider py-1" />
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="text-title font-medium">{t("listHeading")}</h2>
        <SkeletonRows columns={1} rows={4} rowClassName="min-h-14 border-b border-divider py-1" />
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="text-title font-medium">{t("addHeading")}</h2>
        <SkeletonFields count={1} />
      </section>
    </SkeletonRegion>
  );
}
