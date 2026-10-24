import { getTranslations } from "next-intl/server";
import Link from "next/link";

export default async function HomePage() {
  const t = await getTranslations("home");
  const links = [
    { href: "/accounts", label: t("accounts") },
    { href: "/transactions", label: t("transactions") },
    { href: "/imports", label: t("imports") },
    { href: "/categories", label: t("categories") },
    { href: "/rules", label: t("rules") },
    { href: "/synthesis", label: t("synthesis") },
  ];

  return (
    <main className="p-8">
      <h1 className="text-2xl font-semibold">Demain</h1>
      <nav aria-label={t("navLabel")} className="mt-4">
        <ul className="flex gap-6">
          {links.map((link) => (
            <li key={link.href}>
              <Link href={link.href} className="underline">
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </main>
  );
}
