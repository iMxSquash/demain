"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";

import { FLASH_COOKIE, type FlashKind } from "./flash-codec";

export interface Notice {
  id: string;
  kind: FlashKind;
  message: string;
}

const SUCCESS_DISMISS_DELAY_MS = 8000;

function ToastItem({ notice, onDismiss }: { notice: Notice; onDismiss: (id: string) => void }) {
  const t = useTranslations("common");
  const [isPaused, setIsPaused] = useState(false);
  const isError = notice.kind === "error";

  // An error stays until it is dismissed. A success leaves on its own, unless
  // the pointer or the keyboard is on it (WCAG 2.2.1).
  useEffect(() => {
    if (isError || isPaused) return;
    const timer = setTimeout(() => onDismiss(notice.id), SUCCESS_DISMISS_DELAY_MS);
    return () => clearTimeout(timer);
  }, [isError, isPaused, notice.id, onDismiss]);

  return (
    <div
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onFocus={() => setIsPaused(true)}
      onBlur={() => setIsPaused(false)}
      className={`flex items-start gap-3 rounded border-2 bg-white p-3 text-neutral-900 shadow-lg ${
        isError ? "border-red-800" : "border-green-800"
      }`}
    >
      {/* The word carries the kind, the border color only reinforces it. */}
      <p className="flex-1">
        <strong className={isError ? "text-red-800" : "text-green-800"}>
          {isError ? t("toastError") : t("toastSuccess")}
        </strong>{" "}
        {notice.message}
      </p>
      <button
        type="button"
        onClick={() => onDismiss(notice.id)}
        aria-label={t("toastDismiss")}
        className="min-h-11 min-w-11 rounded border border-neutral-500"
      >
        <span aria-hidden="true">×</span>
      </button>
    </div>
  );
}

/**
 * Shows the notice a server action left for this render. The two live regions
 * stay in the page from the start, because a screen reader only announces what
 * is added to a region it already knows. Errors go to the assertive one.
 */
export function Toaster({ notice }: { notice: Notice | null }) {
  const t = useTranslations("common");
  const [toasts, setToasts] = useState<Notice[]>([]);
  const [lastNoticeId, setLastNoticeId] = useState<string | null>(null);

  // Adjusting state while rendering is the documented way to react to a new
  // prop without an extra render pass.
  if (notice !== null && notice.id !== lastNoticeId) {
    setLastNoticeId(notice.id);
    setToasts((current) => [...current, notice]);
  }

  const noticeId = notice?.id;
  useEffect(() => {
    if (noticeId === undefined) return;
    // The notice is shown: without this, a reload would show it again.
    document.cookie = `${FLASH_COOKIE}=; Max-Age=0; Path=/`;
  }, [noticeId]);

  // Stable, because it is a dependency of the timer of each toast: a new
  // identity would restart the timers of the toasts already shown.
  const dismiss = useCallback(
    (id: string) => setToasts((current) => current.filter((toast) => toast.id !== id)),
    [],
  );
  const toastsOfKind = (kind: FlashKind) => toasts.filter((toast) => toast.kind === kind);

  return (
    <section
      aria-label={t("toastRegion")}
      className="fixed bottom-4 right-4 z-20 flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2"
    >
      <div role="status" className="flex flex-col gap-2">
        {toastsOfKind("success").map((toast) => (
          <ToastItem key={toast.id} notice={toast} onDismiss={dismiss} />
        ))}
      </div>
      <div role="alert" className="flex flex-col gap-2">
        {toastsOfKind("error").map((toast) => (
          <ToastItem key={toast.id} notice={toast} onDismiss={dismiss} />
        ))}
      </div>
    </section>
  );
}
