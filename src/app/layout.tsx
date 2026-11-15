import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { cookies } from "next/headers";
import localFont from "next/font/local";
import Link from "next/link";
import { GearSix } from "@phosphor-icons/react/ssr";
import type { ReactNode } from "react";

import { Icon } from "../components/icon";
import { readSession } from "./auth/session";
import { readFlash } from "./feedback/flash";
import { ToastProvider, type Notice } from "./feedback/toast-provider";
import { logoutAction } from "./login/actions";
import { MotionProvider } from "./motion-provider";
import { THEME_COOKIE, themeAttribute } from "./theme/theme-preference";
import { getTranslator } from "./translator";

import "./globals.css";

const CONTENT_ID = "content";

// Self-hosted, never fetched from a CDN. The WOFF2 is a subset of the shipped TTF that keeps
// U+202F (the French thousands separator) mapped to the thin space (DESIGN.md section 5).
// next/font preloads it and adds a size-adjusted Arial fallback by default.
const hostGrotesk = localFont({
  src: "./fonts/HostGrotesk-Variable.woff2",
  weight: "300 800",
  variable: "--font-host-grotesk",
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("home");
  return { title: "Demain", description: t("metaDescription") };
}

async function readNotice(): Promise<Notice | null> {
  const flash = await readFlash();
  if (flash === null) return null;
  const translate = await getTranslator();
  return { id: flash.id, kind: flash.kind, message: translate(flash.ref) };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const [locale, session, t, tSettings, tCommon, notice, cookieStore] = await Promise.all([
    getLocale(),
    readSession(),
    getTranslations("auth"),
    getTranslations("settings"),
    getTranslations("common"),
    readNotice(),
    cookies(),
  ]);
  const isSignedIn = session !== null && !session.mfaPending;

  return (
    <html
      lang={locale}
      className={hostGrotesk.variable}
      data-theme={themeAttribute(cookieStore.get(THEME_COOKIE)?.value)}
    >
      <body>
        <NextIntlClientProvider>
          <MotionProvider>
            <ToastProvider notice={notice}>
              <a
                href={`#${CONTENT_ID}`}
                className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-10 focus:rounded-control focus:bg-surface focus:px-4 focus:py-3 focus:text-text"
              >
                {tCommon("skipToContent")}
              </a>
              <header className="flex flex-wrap items-center justify-end gap-x-6 gap-y-2 px-8 pt-4">
                {isSignedIn ? (
                  <>
                    <Link
                      href="/settings"
                      aria-label={tSettings("navLabel")}
                      className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-pill bg-control hover:bg-control-hover"
                    >
                      <Icon icon={GearSix} />
                    </Link>
                    <form action={logoutAction}>
                      <button type="submit" className="min-h-11 rounded-pill border border-border-control px-3">
                        {t("signOut")}
                      </button>
                    </form>
                  </>
                ) : null}
              </header>
              {/* Focus target of the skip link; each page renders its own <main>. */}
              <div id={CONTENT_ID} tabIndex={-1}>
                {children}
              </div>
            </ToastProvider>
          </MotionProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
