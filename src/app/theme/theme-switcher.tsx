import { getTranslations } from "next-intl/server";
import { cookies } from "next/headers";

import { setThemeAction } from "./actions";
import { THEME_COOKIE, THEME_PREFERENCES, themeAttribute } from "./theme-preference";

/** Works without JavaScript: native radios in a form posted to a server action. */
export async function ThemeSwitcher() {
  const [t, cookieStore] = await Promise.all([getTranslations("theme"), cookies()]);
  const current = themeAttribute(cookieStore.get(THEME_COOKIE)?.value) ?? "system";

  return (
    // The key remounts the form: React does not re-apply a changed defaultChecked after the
    // form reset that follows the action (same reason as LocaleSwitcher).
    <form key={current} action={setThemeAction} className="flex flex-wrap items-center gap-2">
      <fieldset className="flex flex-wrap items-center gap-2">
        <legend className="sr-only">{t("legend")}</legend>
        <div className="segmented">
          {THEME_PREFERENCES.map((preference) => (
            <label key={preference}>
              <input
                type="radio"
                name="theme"
                value={preference}
                defaultChecked={preference === current}
              />
              {t(preference)}
            </label>
          ))}
        </div>
      </fieldset>
      <button type="submit" className="min-h-11 rounded-pill border border-border-control px-3">
        {t("apply")}
      </button>
    </form>
  );
}
