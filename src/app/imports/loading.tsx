import { useTranslations } from "next-intl";
import Link from "next/link";

import {
  SkeletonFields,
  SkeletonRegion,
} from "../../components/skeleton";

export default function Loading() {
  const t = useTranslations("imports");
  const tLoading = useTranslations("loading");
  const common = useTranslations("common");

  return (
    <SkeletonRegion
      as="main"
      label={tLoading("imports")}
      className="mx-auto flex max-w-4xl flex-col gap-6 p-8"
    >
      <Link href="/" className="self-start underline">
        {common("backToHome")}
      </Link>
      <h1 className="text-heading font-medium">{t("title")}</h1>
      <p className="max-w-prose">{t("intro")}</p>
      <SkeletonFields count={3} />
    </SkeletonRegion>
  );
}
