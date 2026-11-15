import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import {
  Archive,
  CurrencyEur,
  Funnel,
  Scales,
  ShieldCheck,
  Tag,
} from "@phosphor-icons/react/ssr";

import { Icon } from "../../components/icon";
import { requireSession } from "../auth/session";
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

export default async function SettingsPage() {
  await requireSession();
  const t = await getTranslations("settings");

  return (
    <main className="flex max-w-2xl flex-col gap-8 p-8">
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
    </main>
  );
}
