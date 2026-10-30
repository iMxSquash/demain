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
      <h1 className="text-2xl font-semibold">{t("errorTitle")}</h1>
      <p className="max-w-prose">{t("errorBody")}</p>
      <button
        type="button"
        onClick={() => retry()}
        className="min-h-11 self-start rounded bg-blue-800 px-4 font-medium text-white"
      >
        {t("errorRetry")}
      </button>
    </main>
  );
}
