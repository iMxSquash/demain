import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  DATABASE_FILE_NAME,
  migrateDatabase,
  openDatabase,
} from "../../src/storage/database";
import { settings } from "../../src/storage/schema";

describe("database migrations", () => {
  let dataDir: string;

  beforeEach(() => {
    dataDir = mkdtempSync(path.join(tmpdir(), "demain-test-"));
  });

  afterEach(() => {
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("creates the data directory and the database file when missing", () => {
    const nestedDir = path.join(dataDir, "nested", "data");

    const db = openDatabase(nestedDir);
    db.$client.close();

    const reopened = openDatabase(nestedDir);
    expect(reopened.$client.name).toBe(path.join(nestedDir, DATABASE_FILE_NAME));
    reopened.$client.close();
  });

  it("applies the migrations on a real SQLite file", () => {
    const db = openDatabase(dataDir);

    migrateDatabase(db);
    db.insert(settings).values({ key: "locale", value: "fr" }).run();

    expect(db.select().from(settings).all()).toEqual([
      { key: "locale", value: "fr" },
    ]);
    db.$client.close();
  });

  it("keeps the data across restarts and tolerates running migrations twice", () => {
    const first = openDatabase(dataDir);
    migrateDatabase(first);
    first.insert(settings).values({ key: "locale", value: "en" }).run();
    first.$client.close();

    const second = openDatabase(dataDir);
    migrateDatabase(second);

    expect(second.select().from(settings).all()).toEqual([
      { key: "locale", value: "en" },
    ]);
    second.$client.close();
  });

  it("enforces foreign keys", () => {
    const db = openDatabase(dataDir);

    const foreignKeys = db.$client.pragma("foreign_keys", { simple: true });

    expect(foreignKeys).toBe(1);
    db.$client.close();
  });
});
