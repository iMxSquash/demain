import { useTranslations } from "next-intl";
import Link from "next/link";

import {
  SkeletonFields,
  SkeletonRegion,
} from "../../../components/skeleton";

export default function Loading() {
  const t = useTranslations("summaryBalances");
  const tLoading = useTranslations("loading");

  return (
    <SkeletonRegion
      as="main"
      label={tLoading("balancesSummary")}
      className="mx-auto flex max-w-4xl flex-col gap-6 p-8"
    >
      <Link href="/balances" className="self-start underline">
        {t("backToBalances")}
      </Link>
      <h1 className="text-heading font-medium">{t("title")}</h1>
      <p className="max-w-prose">{t("intro")}</p>
      <SkeletonFields count={3} />
    </SkeletonRegion>
  );
}
