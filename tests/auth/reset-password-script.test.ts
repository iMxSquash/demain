import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { authenticatePassword, setupOwner } from "../../src/auth/owner";
import { type AppDatabase, migrateDatabase, openDatabase } from "../../src/storage/database";

const SCRIPT = path.join(process.cwd(), "scripts", "reset-password.ts");
const SETUP_TOKEN = "setup-token-of-at-least-thirty-two-characters";
const OLD_PASSWORD = "the password I forgot";
const NEW_PASSWORD = "a brand new passphrase";
// A minimal environment: the command must not depend on anything else.
const BASE_ENV = { NODE_ENV: "test", PATH: process.env.PATH ?? "" } as const;

describe("reset-password command", () => {
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

  /** The password is piped, as `docker exec -i` does without a terminal. */
  function run(stdin: string) {
    return spawnSync(process.execPath, [SCRIPT], {
      input: stdin,
      encoding: "utf8",
      env: { ...BASE_ENV, DEMAIN_DATA_DIR: dataDir },
    });
  }

  async function createOwner() {
    await setupOwner(db, {
      providedToken: SETUP_TOKEN,
      expectedToken: SETUP_TOKEN,
      password: OLD_PASSWORD,
      now: new Date("2026-03-01T10:00:00.000Z"),
    });
  }

  it("replaces the password of the account", async () => {
    await createOwner();

    const result = run(`${NEW_PASSWORD}\n`);

    expect(result.status).toBe(0);
    expect(await authenticatePassword(db, NEW_PASSWORD)).toBe(true);
    expect(await authenticatePassword(db, OLD_PASSWORD)).toBe(false);
  });

  it("never prints the password", async () => {
    await createOwner();

    const result = run(`${NEW_PASSWORD}\n`);

    expect(result.stdout + result.stderr).not.toContain(NEW_PASSWORD);
  });

  it("fails and keeps the old password when the new one is too short", async () => {
    await createOwner();

    const result = run("short\n");

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/at least 12/);
    expect(await authenticatePassword(db, OLD_PASSWORD)).toBe(true);
  });

  it("fails with a clear message when no account exists yet", () => {
    const result = run(`${NEW_PASSWORD}\n`);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/no account/i);
  });

  it("fails when the data directory is not configured", () => {
    const result = spawnSync(process.execPath, [SCRIPT], {
      input: `${NEW_PASSWORD}\n`,
      encoding: "utf8",
      env: BASE_ENV,
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/DEMAIN_DATA_DIR/);
  });
});
