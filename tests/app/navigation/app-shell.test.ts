import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createTranslator } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import { AppShell } from "../../../src/app/navigation/app-shell";
import { loadMessages } from "../../../src/i18n/message-files";

const LOCALE = "en";

// The pathname the client links read; each render sets the page being shown.
let pathname = "/";

vi.mock("next/navigation", () => ({ usePathname: () => pathname }));
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) =>
    createTranslator({ locale: LOCALE, messages: loadMessages(LOCALE), namespace }),
}));

// AppShell is the only async component of the tree: awaiting it leaves elements React renders.
async function renderShell(currentPath: string, toCategorizeCount = 3): Promise<string> {
  pathname = currentPath;
  return renderToStaticMarkup(await AppShell({ toCategorizeCount, children: createElement("main") }));
}

/** Every link of the markup with its target, its accessible text and whether it is current. */
function linksOf(html: string): { href: string; text: string; isCurrent: boolean; label?: string }[] {
  return [...html.matchAll(/<a ([^>]*)>(.*?)<\/a>/g)].map((match) => {
    const attributes = match[1] ?? "";
    return {
      href: /href="([^"]+)"/.exec(attributes)?.[1] ?? "",
      text: (match[2] ?? "").replace(/<[^>]+>/g, "").trim(),
      isCurrent: attributes.includes('aria-current="page"'),
      label: /aria-label="([^"]+)"/.exec(attributes)?.[1],
    };
  });
}

describe("app shell navigation", () => {
  it("marks only the current page with aria-current", async () => {
    const html = await renderShell("/accounts");

    const current = linksOf(html).filter((link) => link.isCurrent);
    expect(current).toEqual([expect.objectContaining({ href: "/accounts", text: "Accounts" })]);
  });

  it("keeps the section current on a page under it", async () => {
    const html = await renderShell("/accounts/3/edit");

    const current = linksOf(html).filter((link) => link.isCurrent);
    expect(current.map((link) => link.href)).toEqual(["/accounts"]);
  });

  it("marks both Settings links, the phone button and the sidebar foot, on the settings page", async () => {
    const html = await renderShell("/settings");

    const current = linksOf(html).filter((link) => link.isCurrent);
    expect(current.map((link) => link.href)).toEqual(["/settings", "/settings"]);
  });

  it("lists the four tabs, then the queue with its count in words", async () => {
    const html = await renderShell("/", 3);

    const nav = /<nav [^>]*aria-label="Main"[^>]*>(.*?)<\/nav>/.exec(html)?.[1] ?? "";
    expect(linksOf(nav).map(({ href, text }) => [href, text])).toEqual([
      ["/", "Overview"],
      ["/transactions", "Transactions"],
      ["/accounts", "Accounts"],
      ["/imports", "Imports"],
      ["/categories", "To categorize3, 3 transactions"],
      ["/settings", "Settings"],
    ]);
  });

  it("hides the badge digits from assistive technology and names the count in words", async () => {
    const html = await renderShell("/", 1);

    expect(html).toMatch(/<span aria-hidden="true"[^>]*>1<\/span><span class="sr-only">, 1 transaction<\/span>/);
  });

  it("gives the icon-only buttons of the top bar an accessible name", async () => {
    const html = await renderShell("/");

    const iconLinks = linksOf(html).filter((link) => link.text === "");
    expect(iconLinks.map(({ href, label }) => [href, label])).toEqual([
      ["/settings", "Settings"],
      ["/transactions#new-heading", "Add transaction"],
    ]);
  });

  it("renders the content after the navigation, so the tab order follows the reading order", async () => {
    const html = await renderShell("/");

    expect(html.indexOf("</nav>")).toBeLessThan(html.indexOf("<main"));
  });
});
