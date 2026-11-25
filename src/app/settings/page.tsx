import type { Metadata } from "next";
import { getTimeZone, getTranslations } from "next-intl/server";
import Link from "next/link";
import { connection } from "next/server";
import { cache, Suspense } from "react";
import {
  Archive,
  ArrowsDownUp,
  CurrencyEur,
  Funnel,
  Receipt,
  Scales,
  ShieldCheck,
  Tag,
} from "@phosphor-icons/react/ssr";

import { Button } from "../../components/button";
import { CountBadge } from "../../components/data-display";
import { Icon } from "../../components/icon";
import { SkeletonFields, SkeletonRegion } from "../../components/skeleton";
import { todayIn } from "../../i18n/dates";
import { getDefaultPaymentMode } from "../../ledger/default-payment-mode";
import { withDatabase } from "../../storage/with-database";
import { requireSession } from "../auth/session";
import { tagDataRead } from "../data-cache";
import { logoutAction } from "../login/actions";
import { readDueCount } from "../planned/due-count";
import { TO_PAY_ROUTE } from "../planned/routes";
import { LocaleSwitcher } from "../locale/locale-switcher";
import { ThemeSwitcher } from "../theme/theme-switcher";
import { DefaultPaymentModeForm } from "./default-payment-mode-form";

const MORE_LINKS = [
  { href: "/transactions", key: "transactions", icon: ArrowsDownUp },
  { href: TO_PAY_ROUTE, key: "toPay", icon: Receipt },
  { href: "/balances", key: "balances", icon: Scales },
  { href: "/categories", key: "categories", icon: Tag },
  { href: "/rules", key: "rules", icon: Funnel },
  { href: "/currencies", key: "currencies", icon: CurrencyEur },
  { href: "/backup", key: "backup", icon: Archive },
  { href: "/security", key: "security", icon: ShieldCheck },
] as const;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings");
  return { title: t("metaTitle") };
}

// One read for the whole request: the session check and the section below share it.
const readStoredPaymentMode = cache(async () => {
  // Inside a `Suspense`, so the page itself joins the prefetched App Shell (ADR-023).
  await requireSession();
  // The page reads the database: it must run per request, never at build time.
  await connection();
  return readDefaultPaymentModeFromDatabase();
});

async function readDefaultPaymentModeFromDatabase() {
  "use cache";
  tagDataRead();
  return withDatabase(getDefaultPaymentMode);
}

// Sends an anonymous visitor the proxy let through to the login page while the page itself awaits
// nothing (ADR-023). The read is shared with the payment mode section, so it costs no second query.
async function SessionCheck() {
  await readStoredPaymentMode();
  return null;
}

async function DefaultPaymentMode() {
  const stored = await readStoredPaymentMode();

  return <DefaultPaymentModeForm key={stored} stored={stored} />;
}

// The count of the To pay row, the one the sidebar shows on a wide screen (DESIGN section 18).
async function ToPayCount() {
  const [t, timeZone] = await Promise.all([getTranslations("navigation"), getTimeZone(), readStoredPaymentMode()]);
  const count = await readDueCount(todayIn(timeZone, new Date()));

  return (
    <>
      <CountBadge decorative count={count} className="ml-auto" />
      <span className="sr-only">, {t("dueCount", { count })}</span>
    </>
  );
}

export default async function SettingsPage() {
  const [t, tAuth, loading] = await Promise.all([
    getTranslations("settings"),
    getTranslations("auth"),
    getTranslations("loading"),
  ]);

  return (
    <main className="flex max-w-2xl flex-col gap-8 p-8">
      <Suspense fallback={null}>
        <SessionCheck />
      </Suspense>
      <h1 className="text-heading font-medium">{t("title")}</h1>
      <section aria-labelledby="appearance-heading" className="flex flex-col gap-4">
        <h2 id="appearance-heading" className="text-title font-medium">
          {t("appearance")}
        </h2>
        <ThemeSwitcher />
      </section>
      <section aria-labelledby="language-heading" className="flex flex-col gap-4">
        <h2 id="language-heading" className="text-title font-medium">
          {t("language")}
        </h2>
        <LocaleSwitcher />
      </section>
      <section aria-labelledby="payment-mode-heading" className="flex flex-col gap-4">
        <h2 id="payment-mode-heading" className="text-title font-medium">
          {t("defaultPaymentMode")}
        </h2>
        <Suspense
          fallback={
            <SkeletonRegion label={loading("form")}>
              <SkeletonFields count={1} />
            </SkeletonRegion>
          }
        >
          <DefaultPaymentMode />
        </Suspense>
      </section>
      <section aria-labelledby="more-heading" className="flex flex-col gap-4">
        <h2 id="more-heading" className="text-title font-medium">
          {t("more")}
        </h2>
        <nav aria-label={t("moreLabel")}>
          <ul className="flex flex-col gap-2">
            {MORE_LINKS.map(({ href, key, icon }) => (
              <li key={href}>
                <Link
                  href={href}
                  className="flex min-h-11 items-center gap-3 rounded-control bg-surface px-4 hover:bg-control-hover"
                >
                  <Icon icon={icon} />
                  {t(`links.${key}`)}
                  {key === "toPay" ? (
                    <Suspense fallback={null}>
                      <ToPayCount />
                    </Suspense>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </section>
      {/* Interim place of sign out, reachable on every width, until the owner decides one. */}
      <form action={logoutAction}>
        <Button type="submit" variant="secondary">
          {tAuth("signOut")}
        </Button>
      </form>
    </main>
  );
}
