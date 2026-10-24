import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getSession, type SessionState } from "../../auth/sessions";
import { withDatabase } from "../../storage/with-database";

const IS_PRODUCTION = process.env.NODE_ENV === "production";
// The __Host- prefix makes browsers refuse the cookie unless it is Secure,
// scoped to the whole host and set without a Domain: it cannot be planted
// from a sibling subdomain. Over plain HTTP (local development) it cannot be
// used, hence the two names.
export const SESSION_COOKIE = IS_PRODUCTION ? "__Host-demain_session" : "demain_session";

const LOGIN_PATH = "/login";
const SECONDS_PER_DAY = 24 * 60 * 60;
// Mirrors the lifetimes enforced by the server in auth/sessions.ts: the cookie
// only avoids sending a token that is certainly dead.
const ACTIVE_COOKIE_MAX_AGE = 30 * SECONDS_PER_DAY;
const PENDING_COOKIE_MAX_AGE = 5 * 60;

export async function setSessionCookie(token: string, mfaPending: boolean): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: IS_PRODUCTION,
    sameSite: "lax",
    path: "/",
    maxAge: mfaPending ? PENDING_COOKIE_MAX_AGE : ACTIVE_COOKIE_MAX_AGE,
  });
}

export async function clearSessionCookie(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function readSessionToken(): Promise<string | undefined> {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}

export async function readSession(): Promise<SessionState | null> {
  const token = await readSessionToken();
  if (!token) {
    return null;
  }
  return withDatabase((db) => getSession(db, token, new Date()));
}

/**
 * Every page and server action that reads or changes data calls this. The
 * proxy already redirects anonymous visitors, but Server Functions are plain
 * POST requests that a matcher change could leave uncovered.
 */
export async function requireSession(): Promise<void> {
  const session = await readSession();
  if (!session || session.mfaPending) {
    redirect(LOGIN_PATH);
  }
}
