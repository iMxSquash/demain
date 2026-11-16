// Shared by next.config.ts and the cached reads (src/app/data-cache.ts). Kept free of Next.js runtime
// imports so the config can load it. See ADR-023.

/** How long the browser reuses a page it already has before asking the server again, in seconds. */
export const CLIENT_STALE_SECONDS = 30;

// Writes refresh the cache through its tag at once. These bounds only cap how long a write that
// forgot to do so could leave a figure wrong.
const DATA_REVALIDATE_SECONDS = 15 * 60;
const DATA_EXPIRE_SECONDS = 60 * 60;

export const DATA_CACHE_LIFETIME = {
  stale: CLIENT_STALE_SECONDS,
  revalidate: DATA_REVALIDATE_SECONDS,
  expire: DATA_EXPIRE_SECONDS,
};
