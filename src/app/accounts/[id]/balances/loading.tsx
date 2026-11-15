import { useTranslations } from "next-intl";
import Link from "next/link";

import {
  SkeletonFields,
  SkeletonLine,
  SkeletonRegion,
  SkeletonTable,
} from "../../../../components/skeleton";

export default function Loading() {
  const t = useTranslations("balances");
  const tLoading = useTranslations("loading");
  const accountsT = useTranslations("accounts");

  return (
    <SkeletonRegion
      as="main"
      label={tLoading("accountBalances")}
      className="mx-auto flex max-w-4xl flex-col gap-8 p-8"
    >
      <Link href="/accounts" className="self-start underline">
        {accountsT("backToAccounts")}
      </Link>
      <SkeletonLine size="heading" width="1/3" />
      <p>{t("intro")}</p>
      <section className="flex flex-col gap-3">
        <h2 className="text-title font-medium">{t("addHeading")}</h2>
        <SkeletonFields count={3} />
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="text-title font-medium">{t("listHeading")}</h2>
        <SkeletonTable columns={6} rows={3} />
      </section>
    </SkeletonRegion>
  );
}
