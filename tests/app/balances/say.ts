import { createTranslator } from "next-intl";

import en from "../../../messages/en.json";
import fr from "../../../messages/fr.json";
import type { Say } from "../../../src/app/balances/summary/describe-issues";

/** A Say in the given language, whose translator fails on a missing key or a badly formed value. */
export function sayIn(locale: "en" | "fr"): Say {
  const t = createTranslator({
    locale,
    messages: locale === "en" ? en : fr,
    namespace: "summaryBalances",
    onError: (error) => {
      throw error;
    },
  });
  return {
    t: (key, values) => t(key, values),
    translate: (ref) => `<${ref.key}>`,
    locale,
    currency: "EUR",
  };
}
