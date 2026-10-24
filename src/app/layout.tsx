import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import type { ReactNode } from "react";

import { readSession } from "./auth/session";
import { logoutAction } from "./login/actions";
import { LocaleSwitcher } from "./locale/locale-switcher";

import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("home");
  return { title: "Demain", description: t("metaDescription") };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const [locale, session, t] = await Promise.all([
    getLocale(),
    readSession(),
    getTranslations("auth"),
  ]);
  const isSignedIn = session !== null && !session.mfaPending;

  return (
    <html lang={locale}>
      <body>
        <NextIntlClientProvider>
          <header className="flex items-center justify-end gap-6 px-8 pt-4">
            {isSignedIn ? (
              <>
                <Link href="/security" className="underline">
                  {t("security")}
                </Link>
                <form action={logoutAction}>
                  <button type="submit" className="min-h-11 rounded border border-neutral-500 px-3">
                    {t("signOut")}
                  </button>
                </form>
              </>
            ) : null}
            <LocaleSwitcher />
          </header>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
