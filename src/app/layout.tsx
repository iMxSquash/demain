import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import { LocaleSwitcher } from "./locale/locale-switcher";

import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("home");
  return { title: "Demain", description: t("metaDescription") };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();

  return (
    <html lang={locale}>
      <body>
        <NextIntlClientProvider>
          <header className="flex justify-end px-8 pt-4">
            <LocaleSwitcher />
          </header>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
