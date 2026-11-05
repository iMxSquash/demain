import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createSession, getSession } from "../../src/auth/sessions";
import { encryptPayload } from "../../src/export/envelope";
import {
  BEFORE_RESTORE_FILE_NAME,
  createSnapshot,
  restoreSnapshot,
} from "../../src/export/snapshot";
import {
  type AppDatabase,
  migrateDatabase,
  openDatabase,
} from "../../src/storage/database";
import { accounts, settings } from "../../src/storage/schema";

const PASSWORD = "a long enough backup passphrase";
const OTHER_PASSWORD = "another long backup passphrase";

function insertAccount(db: AppDatabase, name: string): void {
  db.insert(accounts)
    .values({
      name,
      kind: "checking",
      currency: "EUR",
      openingDate: "2026-01-01",
      openingBalance: 123_456,
    })
    .run();
}

function accountNames(db: AppDatabase): string[] {
  return db
    .select({ name: accounts.name })
    .from(accounts)
    .all()
    .map((row) => row.name);
}

describe("encrypted snapshot", () => {
  const directories: string[] = [];
  const openDatabases: AppDatabase[] = [];

  function newInstance(): { dataDir: string; db: AppDatabase } {
    const dataDir = mkdtempSync(path.join(tmpdir(), "demain-test-"));
    directories.push(dataDir);
    const db = openDatabase(dataDir);
    openDatabases.push(db);
    migrateDatabase(db);
    return { dataDir, db };
  }

  beforeEach(() => {
    directories.length = 0;
    openDatabases.length = 0;
  });

  afterEach(() => {
    for (const db of openDatabases) {
      db.$client.close();
    }
    for (const dir of directories) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("brings back what the instance held when the snapshot was taken", async () => {
    const { db } = newInstance();
    insertAccount(db, "Checking");
    db.insert(settings).values({ key: "locale", value: "fr" }).run();
    const snapshot = await createSnapshot(db, PASSWORD);

    insertAccount(db, "Added after the snapshot");
    db.delete(settings).run();
    await restoreSnapshot(db, snapshot, PASSWORD);

    expect(accountNames(db)).toEqual(["Checking"]);
    expect(db.select().from(settings).all()).toEqual([{ key: "locale", value: "fr" }]);
  });

  it("restores into a brand-new instance, as after losing the volume", async () => {
    const original = newInstance();
    insertAccount(original.db, "Checking");
    const snapshot = await createSnapshot(original.db, PASSWORD);

    const replacement = newInstance();
    await restoreSnapshot(replacement.db, snapshot, PASSWORD);

    expect(accountNames(replacement.db)).toEqual(["Checking"]);
    expect(replacement.db.$client.pragma("integrity_check", { simple: true })).toBe("ok");
  });

  it("keeps working after a restore", async () => {
    const { db } = newInstance();
    insertAccount(db, "Checking");
    const snapshot = await createSnapshot(db, PASSWORD);

    await restoreSnapshot(db, snapshot, PASSWORD);
    insertAccount(db, "Savings");

    expect(accountNames(db)).toEqual(["Checking", "Savings"]);
    expect(db.$client.pragma("journal_mode", { simple: true })).toBe("wal");
  });

  it("signs everyone out, including sessions the snapshot still lists", async () => {
    const { db } = newInstance();
    const now = new Date();
    const token = createSession(db, now, { mfaPending: false });
    const snapshot = await createSnapshot(db, PASSWORD);

    await restoreSnapshot(db, snapshot, PASSWORD);

    expect(getSession(db, token, now)).toBeNull();
  });

  it("keeps the replaced data in a file next to the database", async () => {
    const { dataDir, db } = newInstance();
    insertAccount(db, "Checking");
    const snapshot = await createSnapshot(db, PASSWORD);
    insertAccount(db, "Replaced by the restore");

    await restoreSnapshot(db, snapshot, PASSWORD);

    const before = new Database(path.join(dataDir, BEFORE_RESTORE_FILE_NAME), { readonly: true });
    const names = before.prepare("select name from accounts order by id").all();
    before.close();
    expect(names).toEqual([{ name: "Checking" }, { name: "Replaced by the restore" }]);
  });

  it("leaves no plain copy of the data behind", async () => {
    const { dataDir, db } = newInstance();
    insertAccount(db, "Checking");
    const filesBefore = readdirSync(dataDir).sort();

    const snapshot = await createSnapshot(db, PASSWORD);

    expect(readdirSync(dataDir).sort()).toEqual(filesBefore);
    expect(snapshot.includes(Buffer.from("Checking"))).toBe(false);
  });

  it("changes nothing when the password is wrong", async () => {
    const { db } = newInstance();
    insertAccount(db, "Checking");
    const snapshot = await createSnapshot(db, PASSWORD);
    insertAccount(db, "Added after the snapshot");

    await expect(restoreSnapshot(db, snapshot, OTHER_PASSWORD)).rejects.toMatchObject({
      code: "wrongPasswordOrCorrupt",
    });

    expect(accountNames(db)).toEqual(["Checking", "Added after the snapshot"]);
  });

  it("changes nothing when the file is not a database", async () => {
    const { db } = newInstance();
    insertAccount(db, "Checking");
    const notADatabase = await encryptPayload(Buffer.from("plain text, not SQLite"), PASSWORD, "snapshot");

    await expect(restoreSnapshot(db, notADatabase, PASSWORD)).rejects.toMatchObject({
      code: "invalidDatabase",
    });

    expect(accountNames(db)).toEqual(["Checking"]);
  });

  it("changes nothing when the database is not a Demain database", async () => {
    const { db, dataDir } = newInstance();
    insertAccount(db, "Checking");
    const foreignPath = path.join(dataDir, "foreign.db");
    const foreign = new Database(foreignPath);
    foreign.exec("create table notes (id integer primary key, body text)");
    foreign.close();
    const foreignDatabase = await encryptPayload(readFileSync(foreignPath), PASSWORD, "snapshot");

    await expect(restoreSnapshot(db, foreignDatabase, PASSWORD)).rejects.toMatchObject({
      code: "invalidDatabase",
    });

    expect(accountNames(db)).toEqual(["Checking"]);
  });

  it.each([
    [
      "loops back to its account",
      ["update accounts set overflow_account_id = 2 where id = 1", "update accounts set overflow_account_id = 1 where id = 2"],
    ],
    [
      "crosses currencies",
      ["update accounts set currency = 'USD' where id = 2", "update accounts set overflow_account_id = 2 where id = 1"],
    ],
    [
      "ends on an archived account",
      ["update accounts set archived = 1 where id = 2", "update accounts set overflow_account_id = 2 where id = 1"],
    ],
    [
      "ends on a checking account",
      ["update accounts set kind = 'checking' where id = 2", "update accounts set overflow_account_id = 2 where id = 1"],
    ],
  ])("changes nothing when an overflow chain %s", async (_problem, statements) => {
    const source = newInstance();
    insertAccount(source.db, "First");
    insertAccount(source.db, "Second");
    source.db.$client.exec("update accounts set kind = 'savings'");
    for (const statement of statements) {
      source.db.$client.exec(statement);
    }
    const snapshot = await createSnapshot(source.db, PASSWORD);
    const { db } = newInstance();
    insertAccount(db, "Checking");

    await expect(restoreSnapshot(db, snapshot, PASSWORD)).rejects.toMatchObject({
      code: "invalidOverflowChain",
    });

    expect(accountNames(db)).toEqual(["Checking"]);
  });

  it("accepts a valid overflow chain", async () => {
    const source = newInstance();
    insertAccount(source.db, "First");
    insertAccount(source.db, "Second");
    source.db.$client.exec("update accounts set kind = 'savings'");
    source.db.$client.exec("update accounts set overflow_account_id = 2 where id = 1");
    const snapshot = await createSnapshot(source.db, PASSWORD);
    const { db } = newInstance();

    await restoreSnapshot(db, snapshot, PASSWORD);

    expect(accountNames(db)).toEqual(["First", "Second"]);
  });

  it("changes nothing when the snapshot comes from a newer version of the app", async () => {
    const source = newInstance();
    source.db.$client
      .prepare("insert into __drizzle_migrations (hash, created_at) values ('from-the-future', ?)")
      .run(Date.UTC(2999, 0, 1));
    const snapshot = await createSnapshot(source.db, PASSWORD);
    const { db } = newInstance();
    insertAccount(db, "Checking");

    await expect(restoreSnapshot(db, snapshot, PASSWORD)).rejects.toMatchObject({
      code: "newerSchema",
    });

    expect(accountNames(db)).toEqual(["Checking"]);
  });

  it("applies the migrations the snapshot predates", async () => {
    const current = newInstance().db;
    const olderDir = mkdtempSync(path.join(tmpdir(), "demain-test-"));
    directories.push(olderDir);
    const older = openDatabase(olderDir);
    openDatabases.push(older);
    migrateWithoutLastMigration(older, olderDir);
    const snapshot = await createSnapshot(older, PASSWORD);
    const migrationCount = () =>
      current.$client.prepare("select count(*) as count from __drizzle_migrations").get();
    const fullCount = migrationCount();

    await restoreSnapshot(current, snapshot, PASSWORD);

    expect(migrationCount()).toEqual(fullCount);
  });
});

/** An instance as an earlier release left it: every migration but the latest. */
function migrateWithoutLastMigration(db: AppDatabase, workDir: string): void {
  const source = path.join(process.cwd(), "drizzle");
  const target = path.join(workDir, "older-migrations");
  mkdirSync(path.join(target, "meta"), { recursive: true });
  const journal = JSON.parse(readFileSync(path.join(source, "meta", "_journal.json"), "utf8")) as {
    entries: { tag: string }[];
  };
  journal.entries.pop();
  writeFileSync(path.join(target, "meta", "_journal.json"), JSON.stringify(journal));
  for (const { tag } of journal.entries) {
    cpSync(path.join(source, `${tag}.sql`), path.join(target, `${tag}.sql`));
  }
  migrate(drizzle(db.$client), { migrationsFolder: target });
}
