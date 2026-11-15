import { useTranslations } from "next-intl";
import Link from "next/link";

import {
  SkeletonFields,
  SkeletonLine,
  SkeletonRegion,
} from "../../../../components/skeleton";

export default function Loading() {
  const t = useTranslations("transactions");
  const tLoading = useTranslations("loading");

  return (
    <SkeletonRegion
      as="main"
      label={tLoading("transactionEdit")}
      className="mx-auto flex max-w-3xl flex-col gap-6 p-8"
    >
      <Link href="/transactions" className="self-start underline">
        {t("backToTransactions")}
      </Link>
      <SkeletonLine size="heading" width="1/3" />
      <SkeletonFields count={6} />
    </SkeletonRegion>
  );
}
