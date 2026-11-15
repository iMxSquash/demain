import { useTranslations } from "next-intl";

import {
  SkeletonFields,
  SkeletonPageHead,
  SkeletonRegion,
  SkeletonSection,
  SkeletonTable,
} from "../../components/skeleton";

export default function Loading() {
  const t = useTranslations("loading");

  return (
    <SkeletonRegion as="main" label={t("rules")} className="mx-auto flex max-w-4xl flex-col gap-10 p-8">
      <SkeletonPageHead />
      <SkeletonSection>
        <SkeletonTable columns={5} rows={4} />
      </SkeletonSection>
      <SkeletonSection>
        <SkeletonFields count={4} />
      </SkeletonSection>
    </SkeletonRegion>
  );
}
