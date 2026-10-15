import { getTranslations } from "next-intl/server";

import type { Translate } from "../domain/message";

/** Translates the messages raised by the domain, in the language of the request. */
export async function getTranslator(): Promise<Translate> {
  const t = await getTranslations("feedback");
  return (ref) => t(ref.key, ref.values);
}
