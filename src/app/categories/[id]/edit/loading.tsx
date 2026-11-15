import { useTranslations } from "next-intl";

import {
  SkeletonFields,
  SkeletonPageHead,
  SkeletonRegion,
} from "../../../../components/skeleton";

export default function Loading() {
  const t = useTranslations("loading");

  return (
    <SkeletonRegion as="main" label={t("categoryEdit")} className="mx-auto flex max-w-3xl flex-col gap-6 p-8">
      <SkeletonPageHead />
      <SkeletonFields count={2} />
    </SkeletonRegion>
  );
}
