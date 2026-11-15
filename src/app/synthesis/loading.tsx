import { useTranslations } from "next-intl";
import Link from "next/link";

import {
  SkeletonRegion,
  SkeletonTable,
} from "../../components/skeleton";

export default function Loading() {
  const t = useTranslations("synthesis");
  const tLoading = useTranslations("loading");
  const common = useTranslations("common");

  return (
    <SkeletonRegion
      as="main"
      label={tLoading("synthesis")}
      className="mx-auto flex max-w-6xl flex-col gap-6 p-8"
    >
      <Link href="/" className="self-start underline">
        {common("backToHome")}
      </Link>
      <h1 className="text-heading font-medium">{t("title")}</h1>
      <SkeletonTable columns={6} rows={6} />
    </SkeletonRegion>
  );
}
