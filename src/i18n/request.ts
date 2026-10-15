import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";

import { listLocales, loadMessages } from "./message-files";
import { LOCALE_COOKIE, negotiateLocale } from "./negotiate";

export default getRequestConfig(async () => {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  const locale = negotiateLocale(
    {
      cookie: cookieStore.get(LOCALE_COOKIE)?.value,
      acceptLanguage: headerStore.get("accept-language"),
    },
    listLocales(),
  );

  return {
    locale,
    messages: loadMessages(locale),
    // The date of "today" follows the time zone of the server (the TZ variable
    // in Docker): an explicit value avoids an environment fallback.
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
});
