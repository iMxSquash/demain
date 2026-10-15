import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

// One JSON file per language, named after its BCP 47 tag: adding a language
// is adding a file here. The directory must ship next to the application.
const MESSAGES_DIR = path.join(process.cwd(), "messages");
const FILE_EXTENSION = ".json";

function isLanguageTag(value: string): boolean {
  try {
    return Intl.getCanonicalLocales(value).length === 1;
  } catch {
    // Intl throws a RangeError on a structurally invalid tag.
    return false;
  }
}

/** Languages that ship: a file whose name is not a language tag is ignored. */
export function listLocales(): string[] {
  return readdirSync(MESSAGES_DIR)
    .filter((file) => file.endsWith(FILE_EXTENSION))
    .map((file) => file.slice(0, -FILE_EXTENSION.length))
    .filter(isLanguageTag)
    .sort();
}

export function loadMessages(locale: string): Record<string, unknown> {
  const file = path.join(MESSAGES_DIR, `${locale}${FILE_EXTENSION}`);
  return JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
}
