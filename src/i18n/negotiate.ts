/** Used when neither the cookie nor the browser names a supported language. */
export const DEFAULT_LOCALE = "en";

export const LOCALE_COOKIE = "locale";

interface WeightedTag {
  tag: string;
  weight: number;
}

// "fr-CH, fr;q=0.9, en;q=0.8" becomes [{fr-CH, 1}, {fr, 0.9}, {en, 0.8}].
function parseAcceptLanguage(header: string): WeightedTag[] {
  return header
    .split(",")
    .map((part): WeightedTag | null => {
      const [rawTag = "", ...params] = part.trim().split(";");
      const tag = rawTag.trim();
      if (tag === "" || tag === "*") return null;
      const quality = params
        .map((param) => param.trim())
        .find((param) => param.startsWith("q="));
      const weight = quality === undefined ? 1 : Number(quality.slice(2));
      return Number.isFinite(weight) && weight > 0 ? { tag, weight } : null;
    })
    .filter((entry): entry is WeightedTag => entry !== null)
    .sort((a, b) => b.weight - a.weight);
}

function findSupported(
  tag: string,
  supported: readonly string[],
): string | undefined {
  const wanted = tag.toLowerCase();
  const exact = supported.find((locale) => locale.toLowerCase() === wanted);
  if (exact !== undefined) return exact;
  // "fr-CH" falls back to "fr".
  const language = wanted.split("-")[0];
  return supported.find((locale) => locale.toLowerCase() === language);
}

/**
 * Picks the language of a request: the explicit choice kept in the cookie
 * first, then the browser preferences, then the default.
 */
export function negotiateLocale(
  input: { cookie: string | undefined; acceptLanguage: string | null },
  supported: readonly string[],
): string {
  if (input.cookie !== undefined) {
    const chosen = findSupported(input.cookie, supported);
    if (chosen !== undefined) return chosen;
  }
  for (const { tag } of parseAcceptLanguage(input.acceptLanguage ?? "")) {
    const match = findSupported(tag, supported);
    if (match !== undefined) return match;
  }
  return findSupported(DEFAULT_LOCALE, supported) ?? DEFAULT_LOCALE;
}
