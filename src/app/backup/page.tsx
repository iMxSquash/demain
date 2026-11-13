import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { requireSession } from "../auth/session";
import { DownloadForm } from "./download-form";
import { RestoreForm } from "./restore-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("backup");
  return { title: t("metaTitle") };
}

export default async function BackupPage() {
  await requireSession();
  const [t, common] = await Promise.all([getTranslations("backup"), getTranslations("common")]);

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 p-8">
      <Link href="/" className="self-start underline">
        {common("backToHome")}
      </Link>
      <h1 className="text-heading font-medium">{t("title")}</h1>
      <p className="max-w-prose">{t("intro")}</p>

      <section aria-labelledby="snapshot-heading" className="flex flex-col gap-4">
        <h2 id="snapshot-heading" className="text-title font-medium">
          {t("snapshotHeading")}
        </h2>
        <p className="max-w-prose">{t("snapshotIntro")}</p>
        <DownloadForm
          endpoint="/backup/snapshot"
          passwordLabel={t("password")}
          confirmationLabel={t("passwordConfirmation")}
          submitLabel={t("snapshotSubmit")}
          doneMessage={t("snapshotDone")}
        />
      </section>

      <section aria-labelledby="json-heading" className="flex flex-col gap-4">
        <h2 id="json-heading" className="text-title font-medium">
          {t("jsonHeading")}
        </h2>
        <p className="max-w-prose">{t("jsonIntro")}</p>
        <p className="max-w-prose font-medium">{t("jsonWarning")}</p>
        <DownloadForm
          endpoint="/backup/json"
          passwordLabel={t("jsonPassword")}
          confirmationLabel={t("passwordConfirmation")}
          submitLabel={t("jsonSubmit")}
          doneMessage={t("jsonDone")}
          isPasswordOptional
        />
      </section>

      <section aria-labelledby="restore-heading" className="flex flex-col gap-4">
        <h2 id="restore-heading" className="text-title font-medium">
          {t("restoreHeading")}
        </h2>
        <p className="max-w-prose font-medium">{t("restoreWarning")}</p>
        <RestoreForm />
      </section>
    </main>
  );
}
