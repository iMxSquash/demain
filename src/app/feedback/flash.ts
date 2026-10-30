import { randomUUID } from "node:crypto";

import { cookies } from "next/headers";

import { messageRef, type FeedbackKey, type MessageRef } from "../../domain/message";
import { decodeFlash, encodeFlash, FLASH_COOKIE, type Flash, type FlashKind } from "./flash-codec";

const IS_PRODUCTION = process.env.NODE_ENV === "production";
// Long enough to survive a redirect, short enough that a notice nobody read
// does not come back much later.
const FLASH_MAX_AGE_SECONDS = 60;

async function setFlash(kind: FlashKind, ref: MessageRef): Promise<void> {
  const flash: Flash = { id: randomUUID(), kind, ref };
  (await cookies()).set(FLASH_COOKIE, encodeFlash(flash), {
    // Not HttpOnly: the toast removes the cookie once shown. It holds a
    // message key, nothing else.
    httpOnly: false,
    secure: IS_PRODUCTION,
    sameSite: "lax",
    path: "/",
    maxAge: FLASH_MAX_AGE_SECONDS,
  });
}

/** Tells the user, in a toast, that what they asked for was done. */
export function flashSuccess(key: FeedbackKey, values?: MessageRef["values"]): Promise<void> {
  return setFlash("success", messageRef(key, values));
}

/** Tells the user, in a toast, that what they asked for was not done. */
export function flashError(ref: MessageRef): Promise<void> {
  return setFlash("error", ref);
}

export async function readFlash(): Promise<Flash | null> {
  return decodeFlash((await cookies()).get(FLASH_COOKIE)?.value);
}
