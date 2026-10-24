import { argon2, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const argon2Async = promisify(argon2);

// OWASP minimum for argon2id: 19 MiB of memory, 2 passes, 1 lane.
const MEMORY_KIB = 19_456;
const PASSES = 2;
const PARALLELISM = 1;
const SALT_BYTES = 16;
const TAG_BYTES = 32;
const ARGON2_VERSION = 19;

// $argon2id$v=19$m=<memory>,t=<passes>,p=<lanes>$<salt>$<tag>, base64 without padding.
const PHC_PATTERN =
  /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/;

interface Argon2Params {
  memory: number;
  passes: number;
  parallelism: number;
  tagLength: number;
}

async function derive(password: string, salt: Buffer, params: Argon2Params): Promise<Buffer> {
  return Buffer.from(await argon2Async("argon2id", { message: password, nonce: salt, ...params }));
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const tag = await derive(password, salt, {
    memory: MEMORY_KIB,
    passes: PASSES,
    parallelism: PARALLELISM,
    tagLength: TAG_BYTES,
  });
  return `$argon2id$v=${ARGON2_VERSION}$m=${MEMORY_KIB},t=${PASSES},p=${PARALLELISM}$${toBase64(salt)}$${toBase64(tag)}`;
}

/**
 * Parameters are read from the stored hash, so raising the cost later keeps
 * older hashes valid. A malformed hash is a failed check, never an exception.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const match = PHC_PATTERN.exec(stored);
  if (!match) {
    return false;
  }
  const [, memory, passes, parallelism, salt, tag] = match;
  if (!memory || !passes || !parallelism || !salt || !tag) {
    return false;
  }
  const expected = Buffer.from(tag, "base64");
  try {
    const actual = await derive(password, Buffer.from(salt, "base64"), {
      memory: Number(memory),
      passes: Number(passes),
      parallelism: Number(parallelism),
      tagLength: expected.length,
    });
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    // Out-of-range parameters in a corrupted hash make argon2 throw.
    return false;
  }
}

function toBase64(bytes: Buffer): string {
  return bytes.toString("base64").replace(/=+$/, "");
}
