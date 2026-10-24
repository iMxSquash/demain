import { createHash, randomBytes } from "node:crypto";

import { and, eq, gt } from "drizzle-orm";

import type { AppDatabase } from "../storage/database.ts";
import { sessions } from "../storage/schema.ts";

const TOKEN_BYTES = 32;
const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const PENDING_LIFETIME_MS = 5 * MINUTE_MS;
const ABSOLUTE_LIFETIME_MS = 30 * DAY_MS;
const IDLE_LIFETIME_MS = 7 * DAY_MS;
// A page view reads the session several times (proxy, layout, page, action).
// Recording each of them would be as many SQLite writes for no gain: the idle
// limit is a matter of days, a minute of imprecision is invisible.
const TOUCH_INTERVAL_MS = MINUTE_MS;

export interface SessionState {
  mfaPending: boolean;
}

/**
 * Returns the token to put in the cookie. Only its hash is stored. A session
 * with `mfaPending` has passed the password step only and grants no access.
 */
export function createSession(
  db: AppDatabase,
  now: Date,
  { mfaPending }: SessionState,
): string {
  const token = randomBytes(TOKEN_BYTES).toString("base64url");
  const lifetime = mfaPending ? PENDING_LIFETIME_MS : ABSOLUTE_LIFETIME_MS;
  db.insert(sessions)
    .values({
      id: hashToken(token),
      createdAt: now.toISOString(),
      lastSeenAt: now.toISOString(),
      expiresAt: addMs(now, lifetime),
      mfaPending,
    })
    .run();
  return token;
}

/** Null for an unknown, expired or revoked token. Using a session keeps it alive. */
export function getSession(db: AppDatabase, token: string, now: Date): SessionState | null {
  const id = hashToken(token);
  const session = db.select().from(sessions).where(eq(sessions.id, id)).get();
  if (!session) {
    return null;
  }
  const nowIso = now.toISOString();
  const isIdle = addMs(new Date(session.lastSeenAt), IDLE_LIFETIME_MS) <= nowIso;
  if (session.expiresAt <= nowIso || isIdle) {
    db.delete(sessions).where(eq(sessions.id, id)).run();
    return null;
  }
  if (now.getTime() - new Date(session.lastSeenAt).getTime() >= TOUCH_INTERVAL_MS) {
    db.update(sessions).set({ lastSeenAt: nowIso }).where(eq(sessions.id, id)).run();
  }
  return { mfaPending: session.mfaPending };
}

/** Promotes a pending session once the second factor is verified. */
export function completeMfa(db: AppDatabase, token: string, now: Date): void {
  const nowIso = now.toISOString();
  db.update(sessions)
    .set({
      mfaPending: false,
      createdAt: nowIso,
      lastSeenAt: nowIso,
      expiresAt: addMs(now, ABSOLUTE_LIFETIME_MS),
    })
    .where(
      and(
        eq(sessions.id, hashToken(token)),
        eq(sessions.mfaPending, true),
        gt(sessions.expiresAt, nowIso),
      ),
    )
    .run();
}

export function revokeSession(db: AppDatabase, token: string): void {
  db.delete(sessions).where(eq(sessions.id, hashToken(token))).run();
}

export function revokeAllSessions(db: AppDatabase): void {
  db.delete(sessions).run();
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function addMs(date: Date, ms: number): string {
  return new Date(date.getTime() + ms).toISOString();
}
