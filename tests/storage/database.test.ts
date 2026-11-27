import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  type AppDatabase,
  DATABASE_FILE_NAME,
  migrateDatabase,
  openDatabase,
} from "../../src/storage/database";
import { plannedItems, scenarios, settings, transactions } from "../../src/storage/schema";

const LAST_MIGRATION_BEFORE_SCENARIOS = "0013_planned_items";

/** A database as the previous release left it: migrations up to the given tag. */
function migrateUpTo(db: AppDatabase, workDir: string, lastTag: string): void {
  const source = path.join(process.cwd(), "drizzle");
  const target = path.join(workDir, "older-migrations");
  mkdirSync(path.join(target, "meta"), { recursive: true });
  const journal = JSON.parse(readFileSync(path.join(source, "meta", "_journal.json"), "utf8")) as {
    entries: { tag: string }[];
  };
  journal.entries = journal.entries.slice(
    0,
    journal.entries.findIndex(({ tag }) => tag === lastTag) + 1,
  );
  writeFileSync(path.join(target, "meta", "_journal.json"), JSON.stringify(journal));
  for (const { tag } of journal.entries) {
    cpSync(path.join(source, `${tag}.sql`), path.join(target, `${tag}.sql`));
  }
  migrate(drizzle(db.$client), { migrationsFolder: target });
}

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

    expect(db.select().from(settings).all()).toEqual([{ key: "locale", value: "fr" }]);
    db.$client.close();
  });

  it("keeps the data across restarts and tolerates running migrations twice", () => {
    const first = openDatabase(dataDir);
    migrateDatabase(first);
    first.insert(settings).values({ key: "locale", value: "en" }).run();
    first.$client.close();

    const second = openDatabase(dataDir);
    migrateDatabase(second);

    expect(second.select().from(settings).all()).toEqual([{ key: "locale", value: "en" }]);
    second.$client.close();
  });

  it("enforces foreign keys", () => {
    const db = openDatabase(dataDir);

    const foreignKeys = db.$client.pragma("foreign_keys", { simple: true });

    expect(foreignKeys).toBe(1);
    db.$client.close();
  });

  it("the migration applies on a database of the previous version", () => {
    const db = openDatabase(dataDir);
    migrateUpTo(db, dataDir, LAST_MIGRATION_BEFORE_SCENARIOS);
    db.$client.exec(`
      insert into accounts (id, name, kind, currency, opening_date, opening_balance)
        values (1, 'Checking', 'checking', 'EUR', '2026-01-01', 0);
      insert into planned_items (id, name, kind, account_id, start_date)
        values (1, 'Rent', 'expense', 1, '2026-01-05');
      insert into planned_item_versions (planned_item_id, effective_from, repetition_kind, repetition_value, amount)
        values (1, '2026-01-05', 'monthly_on_day', 5, -80000);
      insert into transactions (account_id, date, amount, kind, label, planned_item_id, occurrence_date)
        values (1, '2026-01-05', -80000, 'expense', 'Rent', 1, '2026-01-05');
    `);

    migrateDatabase(db);

    expect(db.select().from(plannedItems).all()).toEqual([
      expect.objectContaining({ id: 1, name: "Rent", sourceScenarioId: null }),
    ]);
    expect(db.select().from(transactions).all()).toEqual([
      expect.objectContaining({ plannedItemId: 1, occurrenceDate: "2026-01-05" }),
    ]);
    const [scenario] = db
      .insert(scenarios)
      .values({ name: "Plan", createdAt: "2026-11-27" })
      .returning()
      .all();
    db.update(plannedItems).set({ sourceScenarioId: scenario?.id }).run();
    db.delete(scenarios)
      .where(eq(scenarios.id, scenario?.id ?? 0))
      .run();
    expect(db.select().from(plannedItems).all()).toEqual([
      expect.objectContaining({ id: 1, sourceScenarioId: null }),
    ]);
    db.$client.close();
  });
});
