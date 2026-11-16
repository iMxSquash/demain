import { cacheLife, cacheTag, updateTag } from "next/cache";

import { DATA_CACHE_LIFETIME } from "../cache-lifetime";

// One tag for everything read from the database. The figures depend on each other (a rate changes the
// synthesis, an account changes every list), so a finer split would let a write miss a page. See ADR-023.
const DATA_TAG = "data";

/** Called first inside every `"use cache"` read of the database. */
export function tagDataRead(): void {
  cacheTag(DATA_TAG);
  cacheLife(DATA_CACHE_LIFETIME);
}

/** Called by every server action that writes the database, so the next render reads it again. */
export function refreshData(): void {
  updateTag(DATA_TAG);
}
