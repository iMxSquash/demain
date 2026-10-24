import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  authenticatePassword,
  disableTotp,
  enableTotp,
  hasOwner,
  isTotpEnabled,
  resetPassword,
  setupOwner,
  verifySecondFactor,
} from "../../src/auth/owner";
import { createSession, getSession } from "../../src/auth/sessions";
import { computeTotp, generateTotpSecret } from "../../src/auth/totp";
import { type AppDatabase, migrateDatabase, openDatabase } from "../../src/storage/database";
import { owner } from "../../src/storage/schema";

import { at } from "./at";

const SETUP_TOKEN = "setup-token-of-at-least-thirty-two-characters";
const PASSWORD = "a long enough passphrase";
const NOW = new Date("2026-03-01T10:00:00.000Z");

describe("owner account", () => {
  let dataDir: string;
  let db: AppDatabase;

  beforeEach(() => {
    dataDir = mkdtempSync(path.join(tmpdir(), "demain-test-"));
    db = openDatabase(dataDir);
    migrateDatabase(db);
  });

  afterEach(() => {
    db.$client.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  function setup(overrides: Partial<Parameters<typeof setupOwner>[1]> = {}) {
    return setupOwner(db, {
      providedToken: SETUP_TOKEN,
      expectedToken: SETUP_TOKEN,
      password: PASSWORD,
      now: NOW,
      ...overrides,
    });
  }

  describe("first-run setup", () => {
    it("creates the account when the setup token matches", async () => {
      expect(hasOwner(db)).toBe(false);

      expect(await setup()).toEqual({ ok: true });

      expect(hasOwner(db)).toBe(true);
    });

    it("stores a hash of the password, never the password", async () => {
      await setup();

      const stored = db.select().from(owner).get()!;

      expect(stored.passwordHash).toMatch(/^\$argon2id\$/);
      expect(JSON.stringify(stored)).not.toContain(PASSWORD);
    });

    it("refuses a wrong token", async () => {
      expect(await setup({ providedToken: "wrong-token" })).toEqual({
        ok: false,
        reason: "invalidToken",
      });
      expect(hasOwner(db)).toBe(false);
    });

    it("refuses an empty token", async () => {
      expect(await setup({ providedToken: "" })).toEqual({ ok: false, reason: "invalidToken" });
    });

    it("refuses everything when the instance has no setup token configured", async () => {
      expect(await setup({ expectedToken: undefined, providedToken: "" })).toEqual({
        ok: false,
        reason: "invalidToken",
      });
      expect(await setup({ expectedToken: undefined, providedToken: "anything" })).toEqual({
        ok: false,
        reason: "invalidToken",
      });
    });

    it("is disabled once an account exists", async () => {
      await setup();

      expect(await setup({ password: "another long passphrase" })).toEqual({
        ok: false,
        reason: "alreadyConfigured",
      });
      expect(await authenticatePassword(db, PASSWORD)).toBe(true);
    });

    it("refuses a password shorter than twelve characters", async () => {
      expect(await setup({ password: "short" })).toEqual({ ok: false, reason: "tooShort" });
      expect(hasOwner(db)).toBe(false);
    });

    it("refuses an absurdly long password that would only burden the server", async () => {
      expect(await setup({ password: "x".repeat(1025) })).toEqual({
        ok: false,
        reason: "tooLong",
      });
    });
  });

  describe("password check", () => {
    it("accepts the right password and refuses any other", async () => {
      await setup();

      expect(await authenticatePassword(db, PASSWORD)).toBe(true);
      expect(await authenticatePassword(db, "a long enough passphrasE")).toBe(false);
      expect(await authenticatePassword(db, "")).toBe(false);
    });

    it("refuses everything while no account exists", async () => {
      expect(await authenticatePassword(db, PASSWORD)).toBe(false);
    });
  });

  describe("second factor", () => {
    const AT = NOW.getTime();

    beforeEach(async () => {
      await setup();
    });

    it("is off by default", () => {
      expect(isTotpEnabled(db)).toBe(false);
    });

    it("is enabled by proving the app produces the right code, and returns backup codes", () => {
      const secret = generateTotpSecret();

      const result = enableTotp(db, { secret, code: computeTotp(secret, AT), now: NOW });

      expect(result?.backupCodes).toHaveLength(10);
      expect(isTotpEnabled(db)).toBe(true);
    });

    it("is not enabled by a wrong code", () => {
      const secret = generateTotpSecret();

      expect(enableTotp(db, { secret, code: "000000", now: NOW })).toBeNull();
      expect(isTotpEnabled(db)).toBe(false);
    });

    it("accepts a current code once and refuses it again", () => {
      const secret = generateTotpSecret();
      enableTotp(db, { secret, code: computeTotp(secret, AT), now: NOW });

      // Enrollment consumed the current step: the next one is needed.
      const code = computeTotp(secret, AT + 30_000);
      const later = new Date(AT + 30_000);

      expect(verifySecondFactor(db, code, later)).toBe(true);
      expect(verifySecondFactor(db, code, later)).toBe(false);
    });

    it("accepts each backup code once", () => {
      const secret = generateTotpSecret();
      const { backupCodes } = enableTotp(db, {
        secret,
        code: computeTotp(secret, AT),
        now: NOW,
      })!;

      expect(verifySecondFactor(db, at(backupCodes, 0), NOW)).toBe(true);
      expect(verifySecondFactor(db, at(backupCodes, 0), NOW)).toBe(false);
      expect(verifySecondFactor(db, at(backupCodes, 1), NOW)).toBe(true);
    });

    it("refuses a wrong code", () => {
      const secret = generateTotpSecret();
      enableTotp(db, { secret, code: computeTotp(secret, AT), now: NOW });

      expect(verifySecondFactor(db, "123456", NOW)).toBe(false);
      expect(verifySecondFactor(db, "", NOW)).toBe(false);
    });

    it("refuses any code when the second factor is not enabled", () => {
      expect(verifySecondFactor(db, "123456", NOW)).toBe(false);
    });

    it("can be disabled, which also drops the backup codes", () => {
      const secret = generateTotpSecret();
      const { backupCodes } = enableTotp(db, {
        secret,
        code: computeTotp(secret, AT),
        now: NOW,
      })!;

      disableTotp(db);

      expect(isTotpEnabled(db)).toBe(false);
      expect(verifySecondFactor(db, at(backupCodes, 0), NOW)).toBe(false);
    });
  });

  describe("password reset", () => {
    beforeEach(async () => {
      await setup();
    });

    it("replaces the password", async () => {
      const result = await resetPassword(db, "a brand new passphrase");

      expect(result).toEqual({ ok: true });
      expect(await authenticatePassword(db, "a brand new passphrase")).toBe(true);
      expect(await authenticatePassword(db, PASSWORD)).toBe(false);
    });

    it("signs out every session, so a stolen cookie stops working", async () => {
      const token = createSession(db, NOW, { mfaPending: false });

      await resetPassword(db, "a brand new passphrase");

      expect(getSession(db, token, NOW)).toBeNull();
    });

    it("keeps the old password when the new one is refused", async () => {
      expect(await resetPassword(db, "short")).toEqual({ ok: false, reason: "tooShort" });
      expect(await authenticatePassword(db, PASSWORD)).toBe(true);
    });

    it("fails clearly when there is no account to reset", async () => {
      db.delete(owner).run();

      expect(await resetPassword(db, "a brand new passphrase")).toEqual({
        ok: false,
        reason: "noOwner",
      });
    });
  });
});
