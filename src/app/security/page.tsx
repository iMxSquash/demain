import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { isTotpEnabled } from "../../auth/owner";
import { generateTotpSecret, buildTotpUri } from "../../auth/totp";
import { withDatabase } from "../../storage/with-database";
import { AuthForm } from "../auth/auth-form";
import { requireSession } from "../auth/session";
import { disableTotpAction } from "./actions";
import { EnrollTotpForm } from "./enroll-totp-form";

const ISSUER = "Demain";
const ACCOUNT_LABEL = "owner";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.securityPage");
  return { title: t("metaTitle") };
}

export default async function SecurityPage() {
  await requireSession();
  const t = await getTranslations("auth.securityPage");
  const isEnabled = withDatabase(isTotpEnabled);
  const secret = isEnabled ? null : generateTotpSecret();

  return (
    <main className="flex flex-col gap-6 p-8">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <section aria-labelledby="totp-heading" className="flex flex-col gap-4">
        <h2 id="totp-heading" className="text-xl font-semibold">
          {t("totpHeading")}
        </h2>
        {secret ? (
          <>
            <EnrollTotpForm secret={secret}>
              <p>{t("totpOff")}</p>
              <p className="max-w-md">{t("enrollIntro")}</p>
              <p>
                <a href={buildTotpUri(secret, ACCOUNT_LABEL, ISSUER)} className="underline">
                  {t("openInApp")}
                </a>
              </p>
              <p>
                {t("secretLabel")} <code className="font-mono">{secret}</code>
              </p>
            </EnrollTotpForm>
          </>
        ) : (
          <>
            <p>{t("totpOn")}</p>
            <h3 className="text-lg font-semibold">{t("disableHeading")}</h3>
            <p className="max-w-md">{t("disableIntro")}</p>
            <AuthForm
              action={disableTotpAction}
              fields={[
                { name: "password", label: t("password"), type: "password", autoComplete: "current-password" },
              ]}
              submitLabel={t("disable")}
            />
          </>
        )}
      </section>
    </main>
  );
}
