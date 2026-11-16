import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { cookies } from "next/headers";
import localFont from "next/font/local";
import type { ReactNode } from "react";

import { countUncategorizedTransactions } from "../ledger/transactions";
import { withDatabase } from "../storage/with-database";
import { readSession } from "./auth/session";
import { tagDataRead } from "./data-cache";
import { readFlash } from "./feedback/flash";
import { ToastProvider, type Notice } from "./feedback/toast-provider";
import { MotionProvider } from "./motion-provider";
import { AppShell } from "./navigation/app-shell";
import { THEME_COOKIE, themeAttribute } from "./theme/theme-preference";
import { getTranslator } from "./translator";

import "./globals.css";

// A direct visit renders per request: the scripts need the nonce of the request (src/proxy.ts), and
// this layout reads the session for the navigation and the cookies for `lang` and `data-theme`
// (ADR-014). This opt-out covers only that page load. Client navigations into each page are still
// validated, so a page that awaits uncached work outside a `Suspense` is reported (ADR-023).
export const instant = false;

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

async function readToCategorizeCount(): Promise<number> {
  "use cache";
  tagDataRead();
  return withDatabase(countUncategorizedTransactions);
}

async function readNotice(): Promise<Notice | null> {
  const flash = await readFlash();
  if (flash === null) return null;
  const translate = await getTranslator();
  return { id: flash.id, kind: flash.kind, message: translate(flash.ref) };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const [locale, session, tCommon, notice, cookieStore] = await Promise.all([
    getLocale(),
    readSession(),
    getTranslations("common"),
    readNotice(),
    cookies(),
  ]);
  const isSignedIn = session !== null && !session.mfaPending;
  const toCategorizeCount = isSignedIn ? await readToCategorizeCount() : 0;
  // Focus target of the skip link; each page renders its own <main>.
  const content = (
    <div id={CONTENT_ID} tabIndex={-1}>
      {children}
    </div>
  );

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
              {isSignedIn ? (
                <AppShell toCategorizeCount={toCategorizeCount}>
                  {content}
                </AppShell>
              ) : (
                content
              )}
            </ToastProvider>
          </MotionProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
