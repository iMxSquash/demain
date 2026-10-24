import { headers } from "next/headers";

import { messageRef, type Translate } from "../../domain/message";
import { createRateLimiter, type RateLimiter } from "../../auth/rate-limiter";

const MINUTE_MS = 60_000;
const MAX_FAILURES = 5;
const WINDOW_MS = 15 * MINUTE_MS;
const UNKNOWN_CLIENT = "unknown";

// Kept on globalThis: Next.js may evaluate this module more than once (hot
// reload, separate bundles), which would silently reset the counters.
const shared = globalThis as typeof globalThis & {
  demainLimiters?: { login: RateLimiter; totp: RateLimiter };
};
shared.demainLimiters ??= {
  login: createRateLimiter({ maxFailures: MAX_FAILURES, windowMs: WINDOW_MS }),
  totp: createRateLimiter({ maxFailures: MAX_FAILURES, windowMs: WINDOW_MS }),
};

export const loginLimiter = shared.demainLimiters.login;
export const totpLimiter = shared.demainLimiters.totp;

/**
 * One budget per client address, so a stranger cannot lock the owner out. The
 * address is the last entry of the header: the one our own reverse proxy
 * wrote, whether it overwrites a value sent by the client (Caddy) or appends
 * to it (nginx). The first entries are client-controlled. The app port is
 * never published (ARCHITECTURE, deployment).
 */
export async function clientAddress(): Promise<string> {
  const forwarded = (await headers()).get("x-forwarded-for");
  return forwarded?.split(",").at(-1)?.trim() || UNKNOWN_CLIENT;
}

/** The refusal shown while a client is locked out, with the wait rounded up to a minute. */
export function tooManyAttemptsMessage(translate: Translate, retryAfterMs: number): string {
  const minutes = Math.max(1, Math.ceil(retryAfterMs / MINUTE_MS));
  return translate(messageRef("authTooManyAttempts", { minutes }));
}
