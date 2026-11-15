import { useTranslations } from "next-intl";

import {
  SkeletonPageHead,
  SkeletonRegion,
  SkeletonTable,
} from "../../components/skeleton";

export default function Loading() {
  const t = useTranslations("loading");

  return (
    <SkeletonRegion as="main" label={t("synthesis")} className="mx-auto flex max-w-6xl flex-col gap-6 p-8">
      <SkeletonPageHead />
      <SkeletonTable columns={6} rows={6} />
    </SkeletonRegion>
  );
}
