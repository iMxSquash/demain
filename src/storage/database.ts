import { mkdirSync } from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

import * as schema from "./schema";

export const DATABASE_FILE_NAME = "demain.db";

// Resolved from the working directory: the app is always started from the
// project root (or the image workdir), where drizzle-kit writes its output.
const MIGRATIONS_FOLDER = path.join(process.cwd(), "drizzle");

export type AppDatabase = ReturnType<typeof openDatabase>;

export function openDatabase(dataDir: string) {
  mkdirSync(dataDir, { recursive: true });

  const sqlite = new Database(path.join(dataDir, DATABASE_FILE_NAME));
  // WAL: readers are not blocked by the single writer.
  sqlite.pragma("journal_mode = WAL");
  // SQLite ignores foreign keys unless asked, per connection.
  sqlite.pragma("foreign_keys = ON");

  return drizzle(sqlite, { schema });
}

export function migrateDatabase(db: AppDatabase): void {
  migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
}
