import { createTranslator } from "next-intl";

import en from "../../../messages/en.json";
import fr from "../../../messages/fr.json";
import type { ImportSay } from "../../../src/app/imports/describe-issues";

/** An ImportSay in the given language, whose translator fails on a missing key or a badly formed value. */
export function sayIn(locale: "en" | "fr"): ImportSay {
  const t = createTranslator({
    locale,
    messages: locale === "en" ? en : fr,
    namespace: "imports.staged.issues",
    onError: (error) => {
      throw error;
    },
  });
  return {
    t: (key, values) => t(key, values),
    translate: (ref) => `<${ref.key}>`,
    locale,
    currency: "EUR",
    rows: [
      { label: "VIR LIVRET", date: "2026-03-10" },
      { label: "CARD SHOP", date: "2026-03-02" },
    ],
  };
}
