import { argon2, createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { promisify } from "node:util";

import { BackupError } from "./backup-error";

const argon2Async = promisify(argon2);

/*
 * Encrypted file format, version 1. All integers are big-endian.
 *
 *   offset  size  field
 *        0     8  magic "DEMAINBK"
 *        8     1  format version
 *        9     1  payload kind (1: database snapshot, 2: JSON export)
 *       10     4  argon2id memory in KiB
 *       14     1  argon2id passes
 *       15     1  argon2id lanes
 *       16    16  argon2id salt
 *       32    12  AES-256-GCM nonce
 *       44     n  ciphertext
 *     44+n    16  AES-256-GCM tag
 *
 * The 44 header bytes are authenticated, so none of them can be changed
 * without the decryption failing.
 */
const MAGIC = Buffer.from("DEMAINBK", "ascii");
const FORMAT_VERSION = 1;
const VERSION_OFFSET = 8;
const KIND_OFFSET = 9;
const MEMORY_OFFSET = 10;
const PASSES_OFFSET = 14;
const LANES_OFFSET = 15;
const SALT_OFFSET = 16;
const SALT_BYTES = 16;
const NONCE_OFFSET = SALT_OFFSET + SALT_BYTES;
const NONCE_BYTES = 12;
const HEADER_BYTES = NONCE_OFFSET + NONCE_BYTES;
const TAG_BYTES = 16;
const KEY_BYTES = 32;

// Heavier than the login hash: a backup is encrypted rarely and leaves the host.
const MEMORY_KIB = 65_536;
const PASSES = 3;
const LANES = 1;

// Decryption reads these from the file, so they are capped: a crafted header
// must not be able to ask for gigabytes of memory.
const MAX_MEMORY_KIB = 262_144;
const MAX_PASSES = 10;
const MAX_LANES = 4;
// argon2 refuses less than 8 KiB per lane.
const MIN_MEMORY_KIB_PER_LANE = 8;

export const MIN_BACKUP_PASSWORD_LENGTH = 12;

const PAYLOAD_KIND_CODES = { snapshot: 1, "json-export": 2 } as const;

export type PayloadKind = keyof typeof PAYLOAD_KIND_CODES;

export async function encryptPayload(
  payload: Buffer,
  password: string,
  kind: PayloadKind,
): Promise<Buffer> {
  if (password.length < MIN_BACKUP_PASSWORD_LENGTH) {
    throw new BackupError("passwordTooShort");
  }
  const header = Buffer.alloc(HEADER_BYTES);
  MAGIC.copy(header, 0);
  header.writeUInt8(FORMAT_VERSION, VERSION_OFFSET);
  header.writeUInt8(PAYLOAD_KIND_CODES[kind], KIND_OFFSET);
  header.writeUInt32BE(MEMORY_KIB, MEMORY_OFFSET);
  header.writeUInt8(PASSES, PASSES_OFFSET);
  header.writeUInt8(LANES, LANES_OFFSET);
  randomBytes(SALT_BYTES).copy(header, SALT_OFFSET);
  randomBytes(NONCE_BYTES).copy(header, NONCE_OFFSET);

  const cipher = createCipheriv("aes-256-gcm", await deriveKey(password, header), nonceOf(header));
  cipher.setAAD(header);
  const ciphertext = Buffer.concat([cipher.update(payload), cipher.final()]);
  return Buffer.concat([header, ciphertext, cipher.getAuthTag()]);
}

export async function decryptPayload(
  file: Buffer,
  password: string,
  kind: PayloadKind,
): Promise<Buffer> {
  if (file.length < HEADER_BYTES || !file.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new BackupError("notABackup");
  }
  const header = file.subarray(0, HEADER_BYTES);
  assertKnownFormat(header);
  if (header.readUInt8(KIND_OFFSET) !== PAYLOAD_KIND_CODES[kind]) {
    throw new BackupError("wrongKind");
  }
  if (file.length < HEADER_BYTES + TAG_BYTES) {
    throw new BackupError("wrongPasswordOrCorrupt");
  }
  const tag = file.subarray(file.length - TAG_BYTES);
  const ciphertext = file.subarray(HEADER_BYTES, file.length - TAG_BYTES);

  const decipher = createDecipheriv("aes-256-gcm", await deriveKey(password, header), nonceOf(header));
  decipher.setAAD(header);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    // GCM cannot tell a wrong password from a damaged file, and says so.
    throw new BackupError("wrongPasswordOrCorrupt");
  }
}

function assertKnownFormat(header: Buffer): void {
  const memory = header.readUInt32BE(MEMORY_OFFSET);
  const passes = header.readUInt8(PASSES_OFFSET);
  const lanes = header.readUInt8(LANES_OFFSET);
  const isKnown =
    header.readUInt8(VERSION_OFFSET) === FORMAT_VERSION &&
    passes >= 1 &&
    passes <= MAX_PASSES &&
    lanes >= 1 &&
    lanes <= MAX_LANES &&
    memory >= MIN_MEMORY_KIB_PER_LANE * lanes &&
    memory <= MAX_MEMORY_KIB;
  if (!isKnown) {
    throw new BackupError("unsupportedFormat");
  }
}

function nonceOf(header: Buffer): Buffer {
  return header.subarray(NONCE_OFFSET, NONCE_OFFSET + NONCE_BYTES);
}

async function deriveKey(password: string, header: Buffer): Promise<Buffer> {
  return Buffer.from(
    await argon2Async("argon2id", {
      message: password,
      nonce: header.subarray(SALT_OFFSET, SALT_OFFSET + SALT_BYTES),
      memory: header.readUInt32BE(MEMORY_OFFSET),
      passes: header.readUInt8(PASSES_OFFSET),
      parallelism: header.readUInt8(LANES_OFFSET),
      tagLength: KEY_BYTES,
    }),
  );
}
