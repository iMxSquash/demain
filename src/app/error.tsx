"use client";

import { useTranslations } from "next-intl";

/**
 * Fallback for an unexpected failure while rendering a page. It never shows
 * the error: the detail is in the server log, matched by the digest Next.js
 * prints there.
 */
export default function ErrorPage({ retry }: { retry: () => void }) {
  const t = useTranslations("errors");

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-4 p-8">
      <h1 className="text-heading font-medium">{t("errorTitle")}</h1>
      <p className="max-w-prose">{t("errorBody")}</p>
      <button
        type="button"
        onClick={() => retry()}
        className="min-h-11 self-start rounded-pill bg-primary px-4 font-medium text-on-primary hover:bg-primary-hover"
      >
        {t("errorRetry")}
      </button>
    </main>
  );
}
