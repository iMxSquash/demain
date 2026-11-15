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
    <SkeletonRegion as="main" label={t("accounts")} className="mx-auto flex max-w-3xl flex-col gap-10 p-8">
      <SkeletonPageHead backLink={false} />
      <SkeletonSection>
        <SkeletonTable columns={8} rows={3} />
      </SkeletonSection>
      <SkeletonSection>
        <SkeletonFields count={4} />
      </SkeletonSection>
    </SkeletonRegion>
  );
}
