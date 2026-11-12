"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import { isThemePreference, THEME_COOKIE } from "./theme-preference";

const ONE_YEAR_IN_SECONDS = 60 * 60 * 24 * 365;

/** Same shape as setLocaleAction: a plain form post, so it works without JavaScript. */
export async function setThemeAction(formData: FormData): Promise<void> {
  const requested = formData.get("theme");
  // The value comes from the client: only a known preference is stored.
  if (!isThemePreference(requested)) return;
  (await cookies()).set(THEME_COOKIE, requested, {
    path: "/",
    maxAge: ONE_YEAR_IN_SECONDS,
    sameSite: "lax",
  });
  revalidatePath("/", "layout");
}
