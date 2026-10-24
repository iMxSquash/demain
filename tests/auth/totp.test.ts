import { describe, expect, it } from "vitest";

import {
  buildTotpUri,
  computeTotp,
  generateTotpSecret,
  verifyTotp,
} from "../../src/auth/totp";

// RFC 6238 appendix B, SHA-1 secret "12345678901234567890" in base32. The RFC
// lists 8 digits; the 6-digit code is the last 6 of them.
const RFC_SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
const RFC_VECTORS: ReadonlyArray<readonly [seconds: number, code: string]> = [
  [59, "287082"],
  [1_111_111_109, "081804"],
  [1_111_111_111, "050471"],
  [1_234_567_890, "005924"],
  [2_000_000_000, "279037"],
  [20_000_000_000, "353130"],
];

describe("totp", () => {
  it.each(RFC_VECTORS)("computes the RFC 6238 code at %i seconds", (seconds, code) => {
    expect(computeTotp(RFC_SECRET, seconds * 1000)).toBe(code);
  });

  it("generates distinct base32 secrets of 160 bits", () => {
    const first = generateTotpSecret();
    const second = generateTotpSecret();

    expect(first).toMatch(/^[A-Z2-7]{32}$/);
    expect(first).not.toBe(second);
  });

  describe("verification", () => {
    const NOW = 1_111_111_111 * 1000;

    it("accepts the code of the current step and reports its step", () => {
      expect(verifyTotp(RFC_SECRET, "050471", NOW)).toEqual({
        step: Math.floor(1_111_111_111 / 30),
      });
    });

    it("accepts the codes of the previous and next steps to absorb clock drift", () => {
      const previous = computeTotp(RFC_SECRET, NOW - 30_000);
      const next = computeTotp(RFC_SECRET, NOW + 30_000);

      expect(verifyTotp(RFC_SECRET, previous, NOW)).not.toBeNull();
      expect(verifyTotp(RFC_SECRET, next, NOW)).not.toBeNull();
    });

    it("rejects a code two steps away", () => {
      const stale = computeTotp(RFC_SECRET, NOW - 60_000);

      expect(verifyTotp(RFC_SECRET, stale, NOW)).toBeNull();
    });

    it("rejects a code that was already accepted", () => {
      const accepted = verifyTotp(RFC_SECRET, "050471", NOW);

      expect(accepted).not.toBeNull();
      expect(verifyTotp(RFC_SECRET, "050471", NOW, accepted!.step)).toBeNull();
    });

    it("still accepts a later step after an earlier one was used", () => {
      const used = Math.floor(NOW / 30_000) - 1;
      const next = computeTotp(RFC_SECRET, NOW);

      expect(verifyTotp(RFC_SECRET, next, NOW, used)).not.toBeNull();
    });

    it.each(["", "12345", "0504711", "abcdef", "05 047"])(
      "rejects the malformed input %j",
      (input) => {
        expect(verifyTotp(RFC_SECRET, input, NOW)).toBeNull();
      },
    );

    it("tolerates surrounding whitespace typed by the user", () => {
      expect(verifyTotp(RFC_SECRET, " 050471 ", NOW)).not.toBeNull();
    });
  });

  describe("enrollment uri", () => {
    it("builds an otpauth uri an authenticator app can import", () => {
      const uri = buildTotpUri(RFC_SECRET, "owner@example.com", "Demain");

      expect(uri).toBe(
        "otpauth://totp/Demain:owner%40example.com?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&issuer=Demain&algorithm=SHA1&digits=6&period=30",
      );
    });
  });
});
