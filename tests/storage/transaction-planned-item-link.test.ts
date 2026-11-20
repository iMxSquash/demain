import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { type AppDatabase, migrateDatabase, openDatabase } from "../../src/storage/database";

interface ForeignKeyRow {
  table: string;
  from: string;
  on_delete: string;
}

describe("link of a transaction to a planned item", () => {
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

  it("refuses to delete a planned item while a transaction settles one of its occurrences", () => {
    const foreignKeys = db.$client
      .prepare("select * from pragma_foreign_key_list('transactions')")
      .all() as ForeignKeyRow[];

    const link = foreignKeys.find((key) => key.from === "planned_item_id");

    expect(link).toMatchObject({ table: "planned_items", on_delete: "RESTRICT" });
  });
});
