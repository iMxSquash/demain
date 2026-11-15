import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

interface NoticeProps {
  children: ReactNode;
  /** Lets a control point at the notice with `aria-describedby`. */
  id?: string;
  /** Layout only (for example `max-w-prose`). */
  className?: string;
}

/**
 * A warning (DESIGN section 8, "Notice"). The word "Warning:" opens it, so the meaning never
 * rests on the amber alone. It is static text: a caller that adds a notice after the page loaded
 * puts it inside its own live region.
 */
export function Notice({ children, id, className = "" }: NoticeProps) {
  const t = useTranslations("common");

  return (
    <p id={id} className={`rounded-control bg-warning-tint px-4 py-3 text-text ${className}`}>
      <span className="font-medium text-warning">{t("warningLabel")}</span> {children}
    </p>
  );
}
