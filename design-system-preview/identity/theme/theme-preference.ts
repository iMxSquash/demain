export const THEME_COOKIE = "theme";

/** "system" follows the device; it is the default, so a missing cookie means it. */
export const THEME_PREFERENCES = ["system", "light", "dark"] as const;

export type ThemePreference = (typeof THEME_PREFERENCES)[number];

export function isThemePreference(value: unknown): value is ThemePreference {
  return THEME_PREFERENCES.some((preference) => preference === value);
}

/**
 * The `data-theme` attribute the server renders on <html>, read by tokens.css and the
 * `dark` variant of tailwind.css. The system setting renders no attribute: the CSS then
 * follows prefers-color-scheme, so the first paint is right without any script.
 */
export function themeAttribute(
  cookieValue: string | undefined,
): Exclude<ThemePreference, "system"> | undefined {
  return isThemePreference(cookieValue) && cookieValue !== "system" ? cookieValue : undefined;
}
