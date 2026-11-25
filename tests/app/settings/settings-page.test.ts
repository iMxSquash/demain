import { rmSync } from "node:fs";
import path from "node:path";

import { createElement, isValidElement, type ComponentProps, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createTranslator, NextIntlClientProvider } from "next-intl";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { DefaultPaymentModeForm } from "../../../src/app/settings/default-payment-mode-form";
import { createSession } from "../../../src/auth/sessions";
import { Select } from "../../../src/components/select";
import { loadMessages } from "../../../src/i18n/message-files";
import { setDefaultPaymentMode } from "../../../src/ledger/default-payment-mode";
import { DATABASE_FILE_NAME, migrateDatabase, openDatabase } from "../../../src/storage/database";

// Synthetic data only: the directory holds an empty database made by this test.
const DATA_DIR = path.join(process.cwd(), "tests", "fixtures", "settings-data");
const LOCALE = "en";
const SESSION_COOKIE = "demain_session";

const cookieJar = new Map<string, string>();

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (cookieJar.has(name) ? { value: cookieJar.get(name) } : undefined) }),
}));
vi.mock("next/navigation", () => ({
  redirect: (location: string) => {
    throw new Error(`redirect:${location}`);
  },
}));
vi.mock("next/cache", () => ({
  revalidatePath: () => undefined,
  cacheTag: () => undefined,
  cacheLife: () => undefined,
  updateTag: () => undefined,
}));
vi.mock("next/server", () => ({ connection: async () => undefined }));
vi.mock("next-intl/server", () => ({
  getLocale: async () => LOCALE,
  getTimeZone: async () => "Europe/Paris",
  getTranslations: async (namespace: string) =>
    createTranslator({ locale: LOCALE, messages: loadMessages(LOCALE), namespace }),
}));

type AnyComponent = (props: Record<string, unknown>) => ReactNode | Promise<ReactNode>;

// A client component with hooks cannot be called as a function by `resolve`: React renders it.
const RENDERED_BY_REACT: readonly unknown[] = [Select, DefaultPaymentModeForm];

/** Server components are async: resolve them down to plain elements before rendering to a string. */
async function resolve(node: ReactNode): Promise<ReactNode> {
  if (Array.isArray(node)) return Promise.all(node.map(resolve));
  if (!isValidElement(node)) return node;
  const element = node as ReactElement<{ children?: ReactNode }>;
  if (typeof element.type === "function" && !RENDERED_BY_REACT.includes(element.type)) {
    return resolve(await (element.type as AnyComponent)(element.props));
  }
  const children = element.props.children;
  if (children === undefined) return element;
  return createElement(element.type, { ...element.props, key: element.key }, await resolve(children));
}

async function renderSettings(): Promise<string> {
  const { default: SettingsPage } = await import("../../../src/app/settings/page");
  const page = (await resolve(await SettingsPage())) as ReactElement;
  return renderToStaticMarkup(
    createElement(
      NextIntlClientProvider,
      { locale: LOCALE, messages: loadMessages(LOCALE) } as ComponentProps<typeof NextIntlClientProvider>,
      page,
    ),
  );
}

function openSession(mfaPending: boolean): void {
  const db = openDatabase(DATA_DIR);
  try {
    migrateDatabase(db);
    cookieJar.set(SESSION_COOKIE, createSession(db, new Date(), { mfaPending }));
  } finally {
    db.$client.close();
  }
}

function removeDatabase(): void {
  for (const suffix of ["", "-wal", "-shm"]) {
    rmSync(path.join(DATA_DIR, DATABASE_FILE_NAME + suffix), { force: true });
  }
}

describe("settings page", () => {
  beforeAll(() => {
    process.env.DEMAIN_DATA_DIR = DATA_DIR;
    removeDatabase();
  });
  afterAll(removeDatabase);
  beforeEach(() => cookieJar.clear());

  it("renders for a signed-in session", async () => {
    openSession(false);

    const html = await renderSettings();

    expect(html).toContain("<main");
  });

  it("sends a visitor without a session to the login page", async () => {
    await expect(renderSettings()).rejects.toThrow("redirect:/login");
  });

  it("refuses a session that still waits for the second factor", async () => {
    openSession(true);

    await expect(renderSettings()).rejects.toThrow("redirect:/login");
  });

  it("has one h1 and the headings Appearance, Language, Default payment mode and More in order", async () => {
    openSession(false);

    const html = await renderSettings();

    expect(html.match(/<h1[ >]/g)).toHaveLength(1);
    const headings = [...html.matchAll(/<h([1-6])[^>]*>(.*?)<\/h\1>/g)].map((match) => [match[1], match[2]]);
    expect(headings).toEqual([
      ["1", "Settings"],
      ["2", "Appearance"],
      ["2", "Language"],
      ["2", "Default payment mode"],
      ["2", "More"],
    ]);
  });

  it("links to the eight pages of the More list, each with a name and an icon", async () => {
    openSession(false);

    const html = await renderSettings();

    const links = [...html.matchAll(/<a [^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/g)].map((match) => ({
      href: match[1],
      // Joins the text nodes instead of stripping tags with a regex, which CodeQL flags as incomplete sanitization.
      text: [...`>${match[2] ?? ""}<`.matchAll(/>([^<]+)</g)].map((node) => node[1]).join(""),
      hasIcon: (match[2] ?? "").includes("<svg"),
    }));
    expect(links).toEqual([
      { href: "/transactions", text: "Transactions", hasIcon: true },
      {
        href: "/planned/due",
        // The badge digit, then its words for assistive technology.
        text: "To pay0, 0 due",
        hasIcon: true,
      },
      { href: "/balances", text: "Balances", hasIcon: true },
      { href: "/categories", text: "Categories", hasIcon: true },
      { href: "/rules", text: "Rules", hasIcon: true },
      { href: "/currencies", text: "Currencies", hasIcon: true },
      { href: "/backup", text: "Backup", hasIcon: true },
      { href: "/security", text: "Security", hasIcon: true },
    ]);
  });

  it("holds the theme and language controls", async () => {
    openSession(false);

    const html = await renderSettings();

    expect(html).toContain('name="theme"');
    expect(html).toContain('name="locale"');
  });

  it("shows the stored default payment mode as the chosen chip", async () => {
    openSession(false);
    const db = openDatabase(DATA_DIR);
    try {
      setDefaultPaymentMode(db, "direct_debit");
    } finally {
      db.$client.close();
    }

    const html = await renderSettings();

    const radios = [...html.matchAll(/<input[^>]*name="paymentMode"[^>]*>/g)].map(([tag]) => ({
      value: /value="([^"]+)"/.exec(tag)?.[1],
      checked: tag.includes('checked=""'),
    }));
    expect(radios).toEqual([
      { value: "card", checked: false },
      { value: "transfer", checked: false },
      { value: "direct_debit", checked: true },
    ]);
    expect(html).toContain("Direct debit");
    expect(html).toContain("Apply payment mode");
  });
});
