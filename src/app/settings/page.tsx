import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Suspense } from "react";
import {
  Archive,
  CurrencyEur,
  Funnel,
  Scales,
  ShieldCheck,
  Tag,
} from "@phosphor-icons/react/ssr";

import { Button } from "../../components/button";
import { Icon } from "../../components/icon";
import { requireSession } from "../auth/session";
import { logoutAction } from "../login/actions";
import { LocaleSwitcher } from "../locale/locale-switcher";
import { ThemeSwitcher } from "../theme/theme-switcher";

const MORE_LINKS = [
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

// The page shows no data, so nothing waits for the session: the check renders nothing in its own
// `Suspense` and still sends an anonymous visitor to the login page if the proxy ever let one through.
async function SessionCheck() {
  await requireSession();
  return null;
}

export default async function SettingsPage() {
  const [t, tAuth] = await Promise.all([getTranslations("settings"), getTranslations("auth")]);

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
