import { getLocale, getTranslations } from "next-intl/server";

import { Select } from "../../components/select";
import { listLocales } from "../../i18n/message-files";
import { setLocaleAction } from "./actions";

/** Works without JavaScript: a plain form posted to a server action. */
export async function LocaleSwitcher() {
  const [t, current] = await Promise.all([
    getTranslations("locale"),
    getLocale(),
  ]);
  const names = new Intl.DisplayNames([current], { type: "language" });

  return (
    <form action={setLocaleAction} className="flex items-center gap-2">
      <label htmlFor="locale" className="sr-only">{t("label")}</label>
      {/* The key remounts the select: React does not re-apply a changed
          defaultValue after the form reset that follows the action. */}
      <Select key={current} id="locale" name="locale" defaultValue={current} inline>
        {listLocales().map((locale) => (
          <option key={locale} value={locale} lang={locale}>
            {names.of(locale) ?? locale}
          </option>
        ))}
      </Select>
      <button type="submit" className="min-h-11 rounded-pill border border-border-control px-3">
        {t("apply")}
      </button>
    </form>
  );
}
