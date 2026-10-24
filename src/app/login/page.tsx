import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";

import { hasOwner } from "../../auth/owner";
import { withDatabase } from "../../storage/with-database";
import { AuthForm } from "../auth/auth-form";
import { loginAction } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.login");
  return { title: t("metaTitle") };
}

export default async function LoginPage() {
  if (!withDatabase(hasOwner)) {
    redirect("/setup");
  }
  const t = await getTranslations("auth.login");

  return (
    <main className="p-8">
      <h1 className="mb-4 text-2xl font-semibold">{t("title")}</h1>
      <AuthForm
        action={loginAction}
        fields={[
          { name: "password", label: t("password"), type: "password", autoComplete: "current-password" },
        ]}
        submitLabel={t("submit")}
      />
    </main>
  );
}
