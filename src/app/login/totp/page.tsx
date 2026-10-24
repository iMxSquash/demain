import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";

import { AuthForm } from "../../auth/auth-form";
import { readSession } from "../../auth/session";
import { verifyTotpAction } from "../actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.totp");
  return { title: t("metaTitle") };
}

export default async function TotpPage() {
  const session = await readSession();
  if (!session?.mfaPending) {
    redirect("/login");
  }
  const t = await getTranslations("auth.totp");

  return (
    <main className="p-8">
      <h1 className="mb-4 text-2xl font-semibold">{t("title")}</h1>
      <p className="mb-4 max-w-md">{t("intro")}</p>
      <AuthForm
        action={verifyTotpAction}
        fields={[{ name: "code", label: t("code"), type: "text", autoComplete: "one-time-code" }]}
        submitLabel={t("submit")}
      />
    </main>
  );
}
