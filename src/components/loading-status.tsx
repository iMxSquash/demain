"use client";

import { useSyncExternalStore } from "react";

const NEVER_CHANGES = () => () => {};

/**
 * The polite status of a loading region. A live region that already holds its text in the markup
 * of the first load is usually not announced, so the server renders it empty and the text arrives
 * once the page is hydrated, which screen readers do announce. Without JavaScript it stays empty,
 * and the `aria-busy` of the region is then the only signal.
 */
export function LoadingStatus({ label }: { label: string }) {
  const text = useSyncExternalStore(
    NEVER_CHANGES,
    () => label,
    () => "",
  );

  return (
    <p role="status" className="sr-only">
      {text}
    </p>
  );
}
