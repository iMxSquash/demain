import { describe, expect, it } from "vitest";

import { config } from "../../src/proxy";

// Next.js compiles the matcher with path-to-regexp; a regex group in it is plain
// regular expression syntax, so anchoring it is enough to evaluate it here.
const MATCHER = new RegExp(`^${config.matcher[0]}$`);

describe("proxy matcher", () => {
  it.each([
    "/icon.svg",
    "/apple-icon.png",
    "/icons/icon-192.png",
    "/icons/icon-512.png",
    "/icons/icon-maskable-512.png",
    "/manifest.webmanifest",
    "/_next/static/chunks/app.js",
  ])("lets %s through without a session", (pathname) => {
    expect(MATCHER.test(pathname)).toBe(false);
  });

  it.each([
    "/",
    "/transactions",
    "/login",
    "/backup/download",
    "/icon.svg.map",
    "/apple-icon.png/extra",
    "/manifest.webmanifest.json",
    "/iconsecret",
    "/icon-data",
    "/icons/nested/secret.png",
    "/icons/data.json",
  ])("still guards %s", (pathname) => {
    expect(MATCHER.test(pathname)).toBe(true);
  });
});
