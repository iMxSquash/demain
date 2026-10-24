export type RateLimitDecision = { allowed: true } | { allowed: false; retryAfterMs: number };

export interface RateLimiter {
  check(key: string, nowMs: number): RateLimitDecision;
  recordFailure(key: string, nowMs: number): void;
  reset(key: string): void;
  /** Number of keys currently tracked, to keep memory bounded. */
  size(): number;
}

interface RateLimiterOptions {
  maxFailures: number;
  windowMs: number;
}

/**
 * Sliding window over recorded failures, kept in memory: enough for a single
 * instance (ARCHITECTURE, security). The caller passes the clock, and only
 * failed attempts are recorded, so a blocked client cannot extend its own
 * lockout and the owner locked out by a stranger recovers on schedule.
 */
export function createRateLimiter({ maxFailures, windowMs }: RateLimiterOptions): RateLimiter {
  const failuresByKey = new Map<string, number[]>();

  function recentFailures(key: string, nowMs: number): number[] {
    const recent = (failuresByKey.get(key) ?? []).filter((at) => at > nowMs - windowMs);
    if (recent.length === 0) {
      failuresByKey.delete(key);
    } else {
      failuresByKey.set(key, recent);
    }
    return recent;
  }

  return {
    check(key, nowMs) {
      const recent = recentFailures(key, nowMs);
      const oldest = recent[0];
      if (oldest === undefined || recent.length < maxFailures) {
        return { allowed: true };
      }
      return { allowed: false, retryAfterMs: oldest + windowMs - nowMs };
    },
    recordFailure(key, nowMs) {
      failuresByKey.set(key, [...recentFailures(key, nowMs), nowMs]);
    },
    reset(key) {
      failuresByKey.delete(key);
    },
    size() {
      return failuresByKey.size;
    },
  };
}
