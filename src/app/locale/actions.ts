"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

import { listLocales } from "../../i18n/message-files";
import { LOCALE_COOKIE } from "../../i18n/negotiate";

const ONE_YEAR_IN_SECONDS = 60 * 60 * 24 * 365;

export async function setLocaleAction(formData: FormData): Promise<void> {
  const requested = formData.get("locale");
  // The value comes from the client: only a language that ships is accepted.
  if (typeof requested !== "string" || !listLocales().includes(requested)) {
    return;
  }
  (await cookies()).set(LOCALE_COOKIE, requested, {
    path: "/",
    maxAge: ONE_YEAR_IN_SECONDS,
    sameSite: "lax",
  });
  revalidatePath("/", "layout");
}
