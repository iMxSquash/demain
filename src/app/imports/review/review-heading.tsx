"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";

/** The page heading takes the focus when the route opens, so a screen reader starts on it. */
export function ReviewHeading() {
  const t = useTranslations("imports.staged");
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <h1 ref={headingRef} tabIndex={-1} className="text-heading font-medium">
      {t("title")}
    </h1>
  );
}
