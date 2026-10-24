import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";

import { hasOwner, MIN_PASSWORD_LENGTH } from "../../auth/owner";
import { parseEnv } from "../../storage/env";
import { withDatabase } from "../../storage/with-database";
import { AuthForm } from "../auth/auth-form";
import { setupAction } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.setup");
  return { title: t("metaTitle") };
}

export default async function SetupPage() {
  if (withDatabase(hasOwner)) {
    redirect("/login");
  }
  const t = await getTranslations("auth.setup");
  const isTokenConfigured = parseEnv(process.env).DEMAIN_SETUP_TOKEN !== undefined;

  return (
    <main className="p-8">
      <h1 className="mb-4 text-2xl font-semibold">{t("title")}</h1>
      {isTokenConfigured ? (
        <>
          <p className="mb-4 max-w-md">{t("intro", { min: MIN_PASSWORD_LENGTH })}</p>
          <AuthForm
            action={setupAction}
            fields={[
              { name: "token", label: t("token"), type: "password", autoComplete: "off" },
              { name: "password", label: t("password"), type: "password", autoComplete: "new-password" },
              { name: "confirm", label: t("confirm"), type: "password", autoComplete: "new-password" },
            ]}
            submitLabel={t("submit")}
          />
        </>
      ) : (
        <p className="max-w-md">{t("unavailable")}</p>
      )}
    </main>
  );
}
