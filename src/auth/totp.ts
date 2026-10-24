import { createHmac, randomBytes } from "node:crypto";

const STEP_SECONDS = 30;
const DIGITS = 6;
const SECRET_BYTES = 20;
// One step either side of the current one absorbs clock drift between the
// server and the phone.
const DRIFT_STEPS = 1;
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const CODE_PATTERN = new RegExp(`^\\d{${DIGITS}}$`);

export function generateTotpSecret(): string {
  return encodeBase32(randomBytes(SECRET_BYTES));
}

export function computeTotp(secret: string, atMs: number): string {
  return codeForStep(decodeBase32(secret), Math.floor(atMs / 1000 / STEP_SECONDS));
}

/**
 * Returns the accepted step, or null. `lastUsedStep` makes a code single-use:
 * only steps strictly after it are accepted, so a code observed over the
 * shoulder cannot be replayed within its validity window.
 */
export function verifyTotp(
  secret: string,
  input: string,
  nowMs: number,
  lastUsedStep?: number,
): { step: number } | null {
  const code = input.trim();
  if (!CODE_PATTERN.test(code)) {
    return null;
  }
  const key = decodeBase32(secret);
  const currentStep = Math.floor(nowMs / 1000 / STEP_SECONDS);
  for (let step = currentStep - DRIFT_STEPS; step <= currentStep + DRIFT_STEPS; step++) {
    if (lastUsedStep !== undefined && step <= lastUsedStep) {
      continue;
    }
    if (codeForStep(key, step) === code) {
      return { step };
    }
  }
  return null;
}

export function buildTotpUri(secret: string, accountLabel: string, issuer: string): string {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(accountLabel)}`;
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`;
}

function codeForStep(key: Buffer, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const digest = createHmac("sha1", key).update(counter).digest();
  // RFC 4226 dynamic truncation.
  const offset = digest.readUInt8(digest.length - 1) & 0x0f;
  const binary = digest.readUInt32BE(offset) & 0x7fffffff;
  return String(binary % 10 ** DIGITS).padStart(DIGITS, "0");
}

function encodeBase32(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

function decodeBase32(text: string): Buffer {
  const bytes: number[] = [];
  let bits = 0;
  let value = 0;
  for (const char of text.toUpperCase()) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) {
      throw new Error("Invalid base32 character in TOTP secret");
    }
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}
