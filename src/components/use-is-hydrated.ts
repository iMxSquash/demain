"use client";

import { useSyncExternalStore } from "react";

const NEVER_CHANGES = () => () => {};

/** False on the server and during hydration, true afterwards: the first client render matches the HTML. */
export function useIsHydrated(): boolean {
  return useSyncExternalStore(
    NEVER_CHANGES,
    () => true,
    () => false,
  );
}
