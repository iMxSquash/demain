"use client";

import { Check, WarningCircle, X } from "@phosphor-icons/react/ssr";
import { AnimatePresence, m } from "motion/react";
import { useTranslations } from "next-intl";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

import { Icon } from "../../components/icon";
import { useMotion } from "../motion-provider";
import { FLASH_COOKIE, type FlashKind } from "./flash-codec";

export interface Notice {
  id: string;
  kind: FlashKind;
  message: string;
}

const SUCCESS_DISMISS_DELAY_MS = 8000;

type Notify = (kind: FlashKind, message: string) => void;

const NotifyContext = createContext<Notify | null>(null);

/** Shows a toast for an outcome that only the browser knows, such as a download. */
export function useNotify(): Notify {
  const notify = useContext(NotifyContext);
  if (notify === null) throw new Error("useNotify must be used inside the ToastProvider");
  return notify;
}

interface ToastItemProps {
  notice: Notice;
  isRenderedByServer: boolean;
  onDismiss: (id: string) => void;
}

function ToastItem({ notice, isRenderedByServer, onDismiss }: ToastItemProps) {
  const t = useTranslations("common");
  const motion = useMotion();
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
    <m.div
      // A toast in the HTML of the page enters with the stylesheet, which runs from the first
      // paint. Giving it a Motion target would write that target in a style attribute, which the
      // content security policy blocks, so Motion only animates the toasts that the browser adds (ADR-020).
      initial={{ opacity: 0, y: motion.offset.rise }}
      animate={
        isRenderedByServer
          ? undefined
          : {
              opacity: 1,
              y: 0,
              transition: { duration: motion.duration.enter, ease: motion.ease.enter },
            }
      }
      exit={{
        opacity: 0,
        transition: { duration: motion.duration.exit, ease: motion.ease.exit },
      }}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onFocus={() => setIsPaused(true)}
      onBlur={() => setIsPaused(false)}
      className={`flex items-start gap-3 rounded-card bg-surface py-3 pr-3 pl-4 text-text shadow-overlay${
        isRenderedByServer ? " motion-enter" : ""
      }`}
    >
      {/* The disc marks the kind with an icon; the word below carries it for everyone. */}
      <span
        className={`mt-1 grid size-9 shrink-0 place-items-center rounded-full ${
          isError ? "bg-negative-tint text-negative" : "bg-positive-tint text-positive"
        }`}
      >
        <Icon icon={isError ? WarningCircle : Check} />
      </span>
      {/* Two lines tall: one line sits in the middle, a longer text grows downwards. */}
      <p className="flex min-h-11 flex-1 items-center">
        <span>
          <strong className={`font-medium ${isError ? "text-negative" : "text-positive"}`}>
            {isError ? t("toastError") : t("toastSuccess")}
          </strong>{" "}
          {notice.message}
        </span>
      </p>
      <button
        type="button"
        onClick={() => onDismiss(notice.id)}
        aria-label={t("toastDismiss")}
        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full transition-colors hover:bg-control"
      >
        <Icon icon={X} />
      </button>
    </m.div>
  );
}

/**
 * Shows the notice a server action left for this render, and the ones that
 * `useNotify` raises in the browser. The two live regions
 * stay in the page from the start, because a screen reader only announces what
 * is added to a region it already knows. Errors go to the assertive one.
 */
export function ToastProvider({ notice, children }: { notice: Notice | null; children: ReactNode }) {
  const t = useTranslations("common");
  const [toasts, setToasts] = useState<Notice[]>([]);
  const [lastNoticeId, setLastNoticeId] = useState<string | null>(null);
  const browserNoticeCount = useRef(0);
  // The notice of the first render is in the HTML sent by the server; later ones are added in the browser.
  const [serverNoticeId] = useState(notice?.id ?? null);

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
  const notify = useCallback<Notify>((kind, message) => {
    browserNoticeCount.current += 1;
    const id = `browser-${browserNoticeCount.current}`;
    setToasts((current) => [...current, { id, kind, message }]);
  }, []);
  const renderToasts = (kind: FlashKind) =>
    toasts
      .filter((toast) => toast.kind === kind)
      .map((toast) => (
        <ToastItem
          key={toast.id}
          notice={toast}
          isRenderedByServer={toast.id === serverNoticeId}
          onDismiss={dismiss}
        />
      ));

  return (
    <NotifyContext value={notify}>
      {children}
      <section
        aria-label={t("toastRegion")}
        data-toast-region
        className="fixed bottom-4 right-4 z-20 flex w-[calc(100%-2rem)] max-w-105 flex-col gap-2"
      >
        {/* Without `initial={false}` the toast of the first render would start hidden in the HTML. */}
        <div role="status" className="flex flex-col gap-2">
          <AnimatePresence initial={false}>{renderToasts("success")}</AnimatePresence>
        </div>
        <div role="alert" className="flex flex-col gap-2">
          <AnimatePresence initial={false}>{renderToasts("error")}</AnimatePresence>
        </div>
      </section>
    </NotifyContext>
  );
}
