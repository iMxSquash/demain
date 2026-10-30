import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { connection } from "next/server";

import { requireSession } from "./auth/session";
import { RealChart } from "./real-chart";

export default async function HomePage() {
  await requireSession();
  // The chart reads the database and the clock: the page must run per request.
  await connection();
  const t = await getTranslations("home");
  const links = [
    { href: "/accounts", label: t("accounts") },
    { href: "/transactions", label: t("transactions") },
    { href: "/imports", label: t("imports") },
    { href: "/migration", label: t("migration") },
    { href: "/categories", label: t("categories") },
    { href: "/rules", label: t("rules") },
    { href: "/synthesis", label: t("synthesis") },
    { href: "/currencies", label: t("currencies") },
    { href: "/backup", label: t("backup") },
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
      <RealChart />
    </main>
  );
}
