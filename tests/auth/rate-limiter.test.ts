import { describe, expect, it } from "vitest";

import { createRateLimiter } from "../../src/auth/rate-limiter";

const MINUTE = 60_000;

describe("rate limiter", () => {
  const options = { maxFailures: 3, windowMs: 10 * MINUTE };

  it("allows attempts until the failure budget is spent", () => {
    const limiter = createRateLimiter(options);

    limiter.recordFailure("login", 0);
    limiter.recordFailure("login", 1_000);

    expect(limiter.check("login", 2_000)).toEqual({ allowed: true });
  });

  it("blocks once the budget is spent and says how long to wait", () => {
    const limiter = createRateLimiter(options);
    limiter.recordFailure("login", 0);
    limiter.recordFailure("login", 1_000);
    limiter.recordFailure("login", 2_000);

    expect(limiter.check("login", 3_000)).toEqual({
      allowed: false,
      retryAfterMs: 10 * MINUTE - 3_000,
    });
  });

  it("reopens when the oldest failure leaves the window", () => {
    const limiter = createRateLimiter(options);
    limiter.recordFailure("login", 0);
    limiter.recordFailure("login", 1_000);
    limiter.recordFailure("login", 2_000);

    expect(limiter.check("login", 10 * MINUTE - 1).allowed).toBe(false);
    expect(limiter.check("login", 10 * MINUTE).allowed).toBe(true);
  });

  it("does not extend the lockout when blocked attempts keep arriving", () => {
    const limiter = createRateLimiter(options);
    limiter.recordFailure("login", 0);
    limiter.recordFailure("login", 1_000);
    limiter.recordFailure("login", 2_000);

    // Attempts rejected by check() are not recorded as failures by the caller.
    limiter.check("login", 5 * MINUTE);

    expect(limiter.check("login", 10 * MINUTE).allowed).toBe(true);
  });

  it("clears the failures after a success", () => {
    const limiter = createRateLimiter(options);
    limiter.recordFailure("login", 0);
    limiter.recordFailure("login", 1_000);

    limiter.reset("login");
    limiter.recordFailure("login", 2_000);
    limiter.recordFailure("login", 3_000);

    expect(limiter.check("login", 4_000).allowed).toBe(true);
  });

  it("keeps separate budgets per key", () => {
    const limiter = createRateLimiter(options);
    for (const at of [0, 1_000, 2_000]) {
      limiter.recordFailure("login", at);
    }

    expect(limiter.check("login", 3_000).allowed).toBe(false);
    expect(limiter.check("totp", 3_000).allowed).toBe(true);
  });

  it("forgets keys whose failures have all expired", () => {
    const limiter = createRateLimiter(options);
    limiter.recordFailure("login", 0);

    limiter.check("login", 11 * MINUTE);

    expect(limiter.size()).toBe(0);
  });
});
