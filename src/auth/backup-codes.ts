import { createHash, randomInt, timingSafeEqual } from "node:crypto";

const CODE_COUNT = 10;
const GROUP_LENGTH = 5;
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/**
 * The codes are shown once; only their hashes are stored. A plain SHA-256 is
 * enough here because each code carries 50 bits of randomness and verification
 * is rate limited, unlike a human-chosen password.
 */
export function generateBackupCodes(): { codes: string[]; hashes: string[] } {
  const codes = Array.from({ length: CODE_COUNT }, generateCode);
  return { codes, hashes: codes.map(hashCode) };
}

/** Returns the hashes that remain once the code is spent, or null if it is unknown. */
export function consumeBackupCode(hashes: readonly string[], input: string): string[] | null {
  const normalized = normalize(input);
  if (normalized.length !== GROUP_LENGTH * 2) {
    return null;
  }
  const candidate = Buffer.from(hashCode(normalized), "hex");
  // Every hash is compared, so the time taken does not reveal which one matched.
  let matchIndex = -1;
  hashes.forEach((hash, index) => {
    if (timingSafeEqual(candidate, Buffer.from(hash, "hex"))) {
      matchIndex = index;
    }
  });
  if (matchIndex === -1) {
    return null;
  }
  return hashes.filter((_, index) => index !== matchIndex);
}

function generateCode(): string {
  const characters = Array.from({ length: GROUP_LENGTH * 2 }, () => ALPHABET[randomInt(ALPHABET.length)]);
  return `${characters.slice(0, GROUP_LENGTH).join("")}-${characters.slice(GROUP_LENGTH).join("")}`;
}

function normalize(input: string): string {
  return input.replace(/[\s-]/g, "").toUpperCase();
}

function hashCode(code: string): string {
  return createHash("sha256").update(normalize(code)).digest("hex");
}
