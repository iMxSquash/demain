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
async function renderShell(currentPath: string, toCategorizeCount = 3, toPayCount = 2): Promise<string> {
  pathname = currentPath;
  return renderToStaticMarkup(await AppShell({ toCategorizeCount, toPayCount, children: createElement("main") }));
}

/** The text nodes of a fragment, in order: each one sits between a `>` and the next `<`. */
function textOf(fragment: string): string {
  return [...`${fragment}<`.matchAll(/>([^<]+)</g)].map((match) => match[1]).join("");
}

/** Every link of the markup with its target, its accessible text and whether it is current. */
function linksOf(html: string): { href: string; text: string; isCurrent: boolean; label?: string }[] {
  return [...html.matchAll(/<a ([^>]*)>(.*?)<\/a>/g)].map((match) => {
    const attributes = match[1] ?? "";
    return {
      href: /href="([^"]+)"/.exec(attributes)?.[1] ?? "",
      text: textOf(match[2] ?? "").trim(),
      isCurrent: attributes.includes('aria-current="page"'),
      label: /aria-label="([^"]+)"/.exec(attributes)?.[1],
    };
  });
}

const navOf = (html: string) => /<nav [^>]*aria-label="Main"[^>]*>(.*?)<\/nav>/.exec(html)?.[1] ?? "";

/** The navigation without what only the wide sidebar shows (an element with a `wideOnly` class). */
function phoneNavOf(html: string): string {
  return navOf(html)
    .replace(/<ul [^>]*class="[^"]*wideOnly[^"]*"[^>]*>.*?<\/ul>/g, "")
    .replace(/<li [^>]*class="[^"]*wideOnly[^"]*"[^>]*>.*?<\/li>/g, "");
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

  // Contract: the phone tab bar and the wide sidebar share one list. An item that only the sidebar
  // shows (Transactions, Planned, To categorize, Settings) sits in an element whose class
  // contains `wideOnly` (its `li`, or the `ul` of the foot); the CSS module hides it under 900 px.
  // The tab bar is therefore the links of the navigation that are not inside a `wideOnly` element.
  it("lists Overview, Calendar, Accounts and Imports in the phone tab bar", async () => {
    const html = await renderShell("/", 3);

    expect(linksOf(phoneNavOf(html)).map(({ href, text }) => [href, text])).toEqual([
      ["/", "Overview"],
      ["/calendar", "Calendar"],
      ["/accounts", "Accounts"],
      ["/imports", "Imports"],
    ]);
  });

  it("keeps Transactions out of the phone tab bar and in the wide sidebar", async () => {
    const html = await renderShell("/", 3);

    expect(linksOf(phoneNavOf(html)).map((link) => link.href)).not.toContain("/transactions");
    expect(linksOf(navOf(html)).map((link) => link.href)).toContain("/transactions");
  });

  it("lists the wide sidebar in order, then the queue with its count in words and Settings", async () => {
    const html = await renderShell("/", 3);

    expect(linksOf(navOf(html)).map(({ href, text }) => [href, text])).toEqual([
      ["/", "Overview"],
      ["/calendar", "Calendar"],
      ["/transactions", "Transactions"],
      ["/accounts", "Accounts"],
      ["/imports", "Imports"],
      ["/planned", "Planned"],
      ["/planned/due", "To pay2, 2 due"],
      ["/categories", "To categorize3, 3 transactions"],
      ["/settings", "Settings"],
    ]);
  });

  it.each(["/calendar", "/calendar/lines"])("marks Calendar as the current page on %s", async (path) => {
    const html = await renderShell(path);

    const current = linksOf(phoneNavOf(html)).filter((link) => link.isCurrent);
    expect(current.map((link) => link.href)).toEqual(["/calendar"]);
    expect(linksOf(navOf(html)).filter((link) => link.isCurrent).map((link) => link.href)).toEqual(["/calendar"]);
  });

  it("shows the number of due occurrences on the To pay entry of the sidebar, in words too", async () => {
    const html = await renderShell("/", 3, 5);

    const toPay = linksOf(navOf(html)).find((link) => link.href === "/planned/due");
    expect(toPay?.text).toBe("To pay5, 5 due");
    expect(linksOf(phoneNavOf(html)).map((link) => link.href)).not.toContain("/planned/due");
  });

  it("marks only To pay on the To pay page, not Planned", async () => {
    const html = await renderShell("/planned/due");

    expect(linksOf(navOf(html)).filter((link) => link.isCurrent).map((link) => link.href)).toEqual(["/planned/due"]);
  });

  it("marks Calendar on the Link a transaction page, which is reached from the calendar", async () => {
    const html = await renderShell("/planned/link");

    expect(linksOf(navOf(html)).filter((link) => link.isCurrent).map((link) => link.href)).toEqual(["/calendar"]);
  });

  it("keeps Planned current on its own pages", async () => {
    const html = await renderShell("/planned/3");

    expect(linksOf(navOf(html)).filter((link) => link.isCurrent).map((link) => link.href)).toEqual(["/planned"]);
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
