import { useTranslations } from "next-intl";

import {
  SkeletonFields,
  SkeletonLine,
  SkeletonPageHead,
  SkeletonRegion,
} from "../../../components/skeleton";

export default function Loading() {
  const t = useTranslations("loading");

  return (
    <SkeletonRegion as="main" label={t("balancesSummary")} className="mx-auto flex max-w-4xl flex-col gap-6 p-8">
      <SkeletonPageHead />
      <SkeletonLine width="3/4" />
      <SkeletonFields count={3} />
    </SkeletonRegion>
  );
}
