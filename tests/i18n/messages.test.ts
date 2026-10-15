import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

const MESSAGES_DIR = path.join(process.cwd(), "messages");
const REFERENCE_LOCALE = "en";

type Tree = { [key: string]: string | Tree };

function load(locale: string): Tree {
  return JSON.parse(
    readFileSync(path.join(MESSAGES_DIR, `${locale}.json`), "utf8"),
  ) as Tree;
}

function flatten(tree: Tree, prefix = ""): Record<string, string> {
  return Object.entries(tree).reduce<Record<string, string>>(
    (flat, [key, value]) =>
      typeof value === "string"
        ? { ...flat, [`${prefix}${key}`]: value }
        : { ...flat, ...flatten(value, `${prefix}${key}.`) },
    {},
  );
}

function valuesOf(text: string): string[] {
  return [...new Set([...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1] ?? ""))];
}

function tagsOf(text: string): string[] {
  return [...new Set([...text.matchAll(/<(\w+)>/g)].map((m) => m[1] ?? ""))];
}

// Names of the {values} and <tags> a message expects.
function placeholdersOf(text: string): string[] {
  return [...valuesOf(text), ...tagsOf(text).map((tag) => `<${tag}>`)].sort();
}

const LOCALES = readdirSync(MESSAGES_DIR)
  .filter((file) => file.endsWith(".json"))
  .map((file) => file.slice(0, -".json".length));
const REFERENCE = flatten(load(REFERENCE_LOCALE));

describe("translation files", () => {
  it.each(LOCALES)("%s is a valid BCP 47 language tag", (locale) => {
    expect(() => Intl.getCanonicalLocales(locale)).not.toThrow();
  });

  it.each(LOCALES)("%s has exactly the keys of the reference file", (locale) => {
    expect(Object.keys(flatten(load(locale))).sort()).toEqual(
      Object.keys(REFERENCE).sort(),
    );
  });

  it.each(LOCALES)("%s has no empty message", (locale) => {
    const empty = Object.entries(flatten(load(locale))).filter(
      ([, text]) => text.trim() === "",
    );
    expect(empty).toEqual([]);
  });

  it.each(LOCALES)("%s keeps the placeholders of the reference", (locale) => {
    const translated = flatten(load(locale));
    for (const [key, reference] of Object.entries(REFERENCE)) {
      const text = translated[key];
      if (text === undefined) continue;
      expect(placeholdersOf(text), key).toEqual(placeholdersOf(reference));
    }
  });

  it.each(LOCALES)("%s formats every message with its values", (locale) => {
    const messages = load(locale);
    const t = createTranslator({
      locale,
      messages,
      onError: (error) => {
        throw error;
      },
    });

    for (const [key, text] of Object.entries(flatten(messages))) {
      const values = Object.fromEntries(
        valuesOf(text).map((name) => [name, `[${name}]`]),
      );
      // A tag is rendered as its content.
      const tags = Object.fromEntries(
        tagsOf(text).map((name) => [name, (chunks: unknown) => String(chunks)]),
      );
      // The keys are dynamic here, which the typed translator cannot express.
      const output = String(
        (t.rich as (key: string, values: object) => unknown)(key, {
          ...values,
          ...tags,
        }),
      );

      // An apostrophe before a brace would silently swallow a value.
      for (const name of valuesOf(text)) {
        expect(output, key).toContain(`[${name}]`);
      }
    }
  });
});
