import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { connection } from "next/server";
import { Suspense } from "react";

import { isTotpEnabled } from "../../auth/owner";
import { generateTotpSecret, buildTotpUri } from "../../auth/totp";
import { SkeletonFields, SkeletonLine, SkeletonRegion } from "../../components/skeleton";
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

// The title and the heading show at once; what follows depends on whether two-factor is on, so it
// waits for the database.
export default async function SecurityPage() {
  const t = await getTranslations("auth.securityPage");

  return (
    <main className="flex flex-col gap-6 p-8">
      <h1 className="text-heading font-medium">{t("title")}</h1>
      <section aria-labelledby="totp-heading" className="flex flex-col gap-4">
        <h2 id="totp-heading" className="text-title font-medium">
          {t("totpHeading")}
        </h2>
        <Suspense fallback={<TotpLoading />}>
          <Totp />
        </Suspense>
      </section>
    </main>
  );
}

// A line of state, a line of instructions and the fields of the form, the shape both states share.
function TotpLoading() {
  const loading = useTranslations("loading");

  return (
    <SkeletonRegion label={loading("form")} className="flex max-w-md flex-col gap-4">
      <SkeletonLine width="1/2" />
      <SkeletonLine width="3/4" />
      <SkeletonFields count={2} />
    </SkeletonRegion>
  );
}

// Never cached: the secret is drawn fresh for each request and only for a signed-in owner.
async function Totp() {
  await requireSession();
  // The page reads the database: it must run per request, never at build time.
  await connection();
  const t = await getTranslations("auth.securityPage");
  const isEnabled = withDatabase(isTotpEnabled);
  const secret = isEnabled ? null : generateTotpSecret();

  return secret ? (
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
  ) : (
    <>
      <p>{t("totpOn")}</p>
      <h3 className="text-title font-medium">{t("disableHeading")}</h3>
      <p className="max-w-md">{t("disableIntro")}</p>
      <AuthForm
        action={disableTotpAction}
        fields={[
          {
            name: "password",
            label: t("password"),
            type: "password",
            autoComplete: "current-password",
          },
        ]}
        submitLabel={t("disable")}
      />
    </>
  );
}
