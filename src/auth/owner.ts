import { createHash, timingSafeEqual } from "node:crypto";

import { eq } from "drizzle-orm";

import type { AppDatabase } from "../storage/database.ts";
import { owner } from "../storage/schema.ts";
import { consumeBackupCode, generateBackupCodes } from "./backup-codes.ts";
import { hashPassword, verifyPassword } from "./password.ts";
import { revokeAllSessions } from "./sessions.ts";
import { verifyTotp } from "./totp.ts";

// The single account always has this id (enforced by a CHECK in the schema).
const OWNER_ID = 1;
export const MIN_PASSWORD_LENGTH = 12;
// Bounds the work an unauthenticated request can ask of the hash function.
export const MAX_PASSWORD_LENGTH = 1024;
const TOTP_CODE_PATTERN = /^\d{6}$/;

export type PasswordIssue = "tooShort" | "tooLong";
export type SetupResult =
  | { ok: true }
  | { ok: false; reason: "invalidToken" | "alreadyConfigured" | PasswordIssue };
export type ResetResult = { ok: true } | { ok: false; reason: "noOwner" | PasswordIssue };

export function hasOwner(db: AppDatabase): boolean {
  return db.select({ id: owner.id }).from(owner).get() !== undefined;
}

/**
 * Creates the single account. The token comes from the environment: without
 * it, anyone reaching a fresh instance first could take it over. A second
 * account is refused, both here and by the table itself.
 */
export async function setupOwner(
  db: AppDatabase,
  input: {
    providedToken: string;
    expectedToken: string | undefined;
    password: string;
    now: Date;
  },
): Promise<SetupResult> {
  if (!isSetupTokenValid(input.providedToken, input.expectedToken)) {
    return { ok: false, reason: "invalidToken" };
  }
  if (hasOwner(db)) {
    return { ok: false, reason: "alreadyConfigured" };
  }
  const issue = checkPassword(input.password);
  if (issue) {
    return { ok: false, reason: issue };
  }
  const passwordHash = await hashPassword(input.password);
  // Hashing took time: a concurrent setup may have won, the primary key decides.
  const { changes } = db
    .insert(owner)
    .values({ id: OWNER_ID, passwordHash, createdAt: input.now.toISOString() })
    .onConflictDoNothing()
    .run();
  return changes === 0 ? { ok: false, reason: "alreadyConfigured" } : { ok: true };
}

export async function authenticatePassword(db: AppDatabase, password: string): Promise<boolean> {
  const account = getOwner(db);
  if (!account || password.length > MAX_PASSWORD_LENGTH) {
    return false;
  }
  return verifyPassword(password, account.passwordHash);
}

export async function resetPassword(db: AppDatabase, password: string): Promise<ResetResult> {
  if (!hasOwner(db)) {
    return { ok: false, reason: "noOwner" };
  }
  const issue = checkPassword(password);
  if (issue) {
    return { ok: false, reason: issue };
  }
  const passwordHash = await hashPassword(password);
  db.update(owner).set({ passwordHash }).where(eq(owner.id, OWNER_ID)).run();
  // A cookie stolen before the reset must not outlive it.
  revokeAllSessions(db);
  return { ok: true };
}

export function isTotpEnabled(db: AppDatabase): boolean {
  return getOwner(db)?.totpSecret != null;
}

/**
 * Enables TOTP once the user proves the authenticator produces the right code
 * for the candidate secret. The backup codes are returned for display, once.
 */
export function enableTotp(
  db: AppDatabase,
  input: { secret: string; code: string; now: Date },
): { backupCodes: string[] } | null {
  const account = getOwner(db);
  if (!account || account.totpSecret !== null) {
    return null;
  }
  const accepted = verifyTotp(input.secret, input.code, input.now.getTime());
  if (!accepted) {
    return null;
  }
  const { codes, hashes } = generateBackupCodes();
  db.update(owner)
    .set({
      totpSecret: input.secret,
      totpLastStep: accepted.step,
      backupCodeHashes: JSON.stringify(hashes),
    })
    .where(eq(owner.id, OWNER_ID))
    .run();
  return { backupCodes: codes };
}

export function disableTotp(db: AppDatabase): void {
  db.update(owner)
    .set({ totpSecret: null, totpLastStep: null, backupCodeHashes: "[]" })
    .where(eq(owner.id, OWNER_ID))
    .run();
}

/** A TOTP code or a backup code. A code that was accepted once is refused afterwards. */
export function verifySecondFactor(db: AppDatabase, input: string, now: Date): boolean {
  const account = getOwner(db);
  if (!account || account.totpSecret === null) {
    return false;
  }
  const code = input.trim();
  if (TOTP_CODE_PATTERN.test(code)) {
    const accepted = verifyTotp(
      account.totpSecret,
      code,
      now.getTime(),
      account.totpLastStep ?? undefined,
    );
    if (!accepted) {
      return false;
    }
    db.update(owner).set({ totpLastStep: accepted.step }).where(eq(owner.id, OWNER_ID)).run();
    return true;
  }
  const remaining = consumeBackupCode(JSON.parse(account.backupCodeHashes) as string[], code);
  if (!remaining) {
    return false;
  }
  db.update(owner)
    .set({ backupCodeHashes: JSON.stringify(remaining) })
    .where(eq(owner.id, OWNER_ID))
    .run();
  return true;
}

export function checkPassword(password: string): PasswordIssue | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return "tooShort";
  }
  return password.length > MAX_PASSWORD_LENGTH ? "tooLong" : null;
}

function getOwner(db: AppDatabase) {
  return db.select().from(owner).where(eq(owner.id, OWNER_ID)).get();
}

function isSetupTokenValid(provided: string, expected: string | undefined): boolean {
  if (!expected || !provided) {
    return false;
  }
  // Hashing first gives both sides the same length, as timingSafeEqual requires.
  return timingSafeEqual(sha256(provided), sha256(expected));
}

function sha256(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}
