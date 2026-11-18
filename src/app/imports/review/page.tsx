import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";

import { SkeletonFields, SkeletonRegion } from "../../../components/skeleton";
import { requireSession } from "../../auth/session";
import { readImportContext } from "../import-context";
import { ImportReview } from "../import-review";
import { ReviewHeading } from "./review-heading";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("imports.staged");
  return { title: t("metaTitle") };
}

export default async function ImportReviewPage() {
  const t = await getTranslations("imports");

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 p-8">
      <Link href="/imports" className="self-start underline">
        {t("staged.backToImport")}
      </Link>
      <ReviewHeading />
      <Suspense fallback={<ReviewLoading />}>
        <ReviewSection />
      </Suspense>
    </main>
  );
}

function ReviewLoading() {
  const loading = useTranslations("loading");

  return (
    <SkeletonRegion label={loading("form")}>
      <SkeletonFields count={2} />
    </SkeletonRegion>
  );
}

async function ReviewSection() {
  await requireSession();
  // The page reads the database: it must run per request, never at build time.
  await connection();
  const { view, assertionSnapshot } = await readImportContext();

  return <ImportReview {...view} assertionSnapshot={assertionSnapshot} />;
}
