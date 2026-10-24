import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  completeMfa,
  createSession,
  getSession,
  revokeAllSessions,
  revokeSession,
} from "../../src/auth/sessions";
import { type AppDatabase, migrateDatabase, openDatabase } from "../../src/storage/database";
import { sessions } from "../../src/storage/schema";

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const START = new Date("2026-03-01T10:00:00.000Z");

function at(offsetMs: number): Date {
  return new Date(START.getTime() + offsetMs);
}

describe("sessions", () => {
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

  it("recognizes the token it issued", () => {
    const token = createSession(db, START, { mfaPending: false });

    expect(getSession(db, token, at(MINUTE))).toEqual({ mfaPending: false });
  });

  it("issues a different unguessable token each time", () => {
    const first = createSession(db, START, { mfaPending: false });
    const second = createSession(db, START, { mfaPending: false });

    expect(first).not.toBe(second);
    expect(first.length).toBeGreaterThanOrEqual(43);
  });

  it("rejects a token it never issued", () => {
    createSession(db, START, { mfaPending: false });

    expect(getSession(db, "forged-token", at(MINUTE))).toBeNull();
    expect(getSession(db, "", at(MINUTE))).toBeNull();
  });

  it("never stores the token itself", () => {
    const token = createSession(db, START, { mfaPending: false });

    const stored = db.select().from(sessions).all();

    expect(stored).toHaveLength(1);
    expect(JSON.stringify(stored)).not.toContain(token);
  });

  it("expires after a week without use", () => {
    const token = createSession(db, START, { mfaPending: false });

    expect(getSession(db, token, at(7 * DAY - 1))).not.toBeNull();
    expect(getSession(db, token, at(14 * DAY))).toBeNull();
  });

  it("stays alive while used, until the absolute limit of thirty days", () => {
    const token = createSession(db, START, { mfaPending: false });

    for (let day = 5; day < 30; day += 5) {
      expect(getSession(db, token, at(day * DAY))).not.toBeNull();
    }

    expect(getSession(db, token, at(30 * DAY))).toBeNull();
  });

  describe("keeping a session alive", () => {
    function lastSeenAt(): string {
      return db.select().from(sessions).get()!.lastSeenAt;
    }

    it("does not write on every read, a page view reads the session several times", () => {
      const token = createSession(db, START, { mfaPending: false });

      getSession(db, token, at(30_000));

      expect(lastSeenAt()).toBe(START.toISOString());
    });

    it("records the use once the last record is older than a minute", () => {
      const token = createSession(db, START, { mfaPending: false });

      getSession(db, token, at(MINUTE));

      expect(lastSeenAt()).toBe(at(MINUTE).toISOString());
    });

    it("still ends a session unused for a week, to the minute", () => {
      const token = createSession(db, START, { mfaPending: false });
      getSession(db, token, at(30_000));

      expect(getSession(db, token, at(7 * DAY))).toBeNull();
    });
  });

  it("removes an expired session from the database", () => {
    const token = createSession(db, START, { mfaPending: false });

    getSession(db, token, at(8 * DAY));

    expect(db.select().from(sessions).all()).toHaveLength(0);
  });

  it("revokes one session without touching the others", () => {
    const kept = createSession(db, START, { mfaPending: false });
    const revoked = createSession(db, START, { mfaPending: false });

    revokeSession(db, revoked);

    expect(getSession(db, revoked, at(MINUTE))).toBeNull();
    expect(getSession(db, kept, at(MINUTE))).not.toBeNull();
  });

  it("revokes every session at once", () => {
    const first = createSession(db, START, { mfaPending: false });
    const second = createSession(db, START, { mfaPending: true });

    revokeAllSessions(db);

    expect(getSession(db, first, at(MINUTE))).toBeNull();
    expect(getSession(db, second, at(MINUTE))).toBeNull();
  });

  describe("between the password and the TOTP step", () => {
    it("is reported as pending", () => {
      const token = createSession(db, START, { mfaPending: true });

      expect(getSession(db, token, at(MINUTE))).toEqual({ mfaPending: true });
    });

    it("lapses after five minutes, however recently it was used", () => {
      const token = createSession(db, START, { mfaPending: true });

      expect(getSession(db, token, at(4 * MINUTE))).not.toBeNull();
      expect(getSession(db, token, at(5 * MINUTE))).toBeNull();
    });

    it("becomes a full session once the second factor is verified", () => {
      const token = createSession(db, START, { mfaPending: true });

      completeMfa(db, token, at(2 * MINUTE));

      expect(getSession(db, token, at(3 * MINUTE))).toEqual({ mfaPending: false });
      expect(getSession(db, token, at(2 * DAY))).toEqual({ mfaPending: false });
    });

    it("does not resurrect a pending session that already lapsed", () => {
      const token = createSession(db, START, { mfaPending: true });

      completeMfa(db, token, at(10 * MINUTE));

      expect(getSession(db, token, at(11 * MINUTE))).toBeNull();
    });
  });
});
