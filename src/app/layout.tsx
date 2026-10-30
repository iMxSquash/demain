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
  const [locale, session, t, tCommon] = await Promise.all([
    getLocale(),
    readSession(),
    getTranslations("auth"),
    getTranslations("common"),
  ]);
  const isSignedIn = session !== null && !session.mfaPending;

  return (
    <html lang={locale}>
      <body>
        <NextIntlClientProvider>
          <a
            href="#content"
            className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-10 focus:rounded focus:bg-white focus:px-4 focus:py-3 focus:text-neutral-900"
          >
            {tCommon("skipToContent")}
          </a>
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
          {/* Focus target of the skip link; each page renders its own <main>. */}
          <div id="content" tabIndex={-1}>
            {children}
          </div>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
