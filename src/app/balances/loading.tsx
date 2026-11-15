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
    <SkeletonRegion as="main" label={t("balances")} className="mx-auto flex max-w-4xl flex-col gap-8 p-8">
      <SkeletonPageHead />
      <SkeletonSection>
        <SkeletonFields count={3} />
      </SkeletonSection>
      <SkeletonSection>
        <SkeletonTable columns={6} rows={3} />
      </SkeletonSection>
    </SkeletonRegion>
  );
}
