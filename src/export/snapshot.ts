import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import Database from "better-sqlite3";

import { revokeAllSessions } from "../auth/sessions";
import { AccountValidationError } from "../domain/account";
import { assertOverflowTargetAllowed, type OverflowLink } from "../domain/overflow";
import {
  type AppDatabase,
  latestKnownMigrationTime,
  migrateDatabase,
} from "../storage/database";
import { BackupError } from "./backup-error";
import { decryptPayload, encryptPayload } from "./envelope";

// Restoring replaces everything with no way back, so what was there is kept.
export const BEFORE_RESTORE_FILE_NAME = "before-restore.db";
const SCRATCH_DIR_PREFIX = ".snapshot-";
const SCRATCH_FILE_NAME = "database.db";
const OWNER_ONLY = 0o600;

/**
 * A consistent copy of the database taken with SQLite's online backup, so the
 * app keeps running and a write in progress cannot tear the copy, then
 * encrypted with a key derived from `password`.
 */
export async function createSnapshot(db: AppDatabase, password: string): Promise<Buffer> {
  return withScratchDirectory(db, async (directory) => {
    const copy = path.join(directory, SCRATCH_FILE_NAME);
    await db.$client.backup(copy);
    return encryptPayload(await readFile(copy), password, "snapshot");
  });
}

/**
 * Replaces the content of the database with the snapshot's. Everything is
 * checked before anything is touched: a wrong password, a file that is not a
 * Demain database or one made by a newer release leaves the instance as it was.
 * Migrations the snapshot predates are applied afterwards.
 */
export async function restoreSnapshot(
  db: AppDatabase,
  snapshot: Buffer,
  password: string,
): Promise<void> {
  const payload = await decryptPayload(snapshot, password, "snapshot");

  await withScratchDirectory(db, async (directory) => {
    const incoming = path.join(directory, SCRATCH_FILE_NAME);
    await writeFile(incoming, payload, { mode: OWNER_ONLY });
    assertRestorable(incoming);

    await db.$client.backup(path.join(path.dirname(db.$client.name), BEFORE_RESTORE_FILE_NAME));
    const source = new Database(incoming);
    try {
      // The backup writes through a second connection: other connections to the
      // live file see the new content, no file is swapped under them.
      await source.backup(db.$client.name);
    } finally {
      source.close();
    }
  });

  migrateDatabase(db);
  // The sessions are the snapshot's: one revoked since (after a stolen cookie,
  // say) would be valid again. Nobody stays signed in across a restore.
  revokeAllSessions(db);
}

function assertRestorable(file: string): void {
  let candidate: Database.Database | undefined;
  try {
    candidate = new Database(file, { fileMustExist: true });
    const isIntact =
      candidate.pragma("integrity_check", { simple: true }) === "ok" &&
      (candidate.pragma("foreign_key_check") as unknown[]).length === 0;
    // Only a database made by Demain has the table drizzle keeps its migrations in.
    const latest = candidate
      .prepare<[], { latest: number | null }>("select max(created_at) as latest from __drizzle_migrations")
      .get()?.latest;
    if (!isIntact) {
      throw new BackupError("invalidDatabase");
    }
    if ((latest ?? 0) > latestKnownMigrationTime()) {
      throw new BackupError("newerSchema");
    }
    assertOverflowChainsValid(candidate);
  } catch (error) {
    if (error instanceof Database.SqliteError) {
      throw new BackupError("invalidDatabase");
    }
    throw error;
  } finally {
    candidate?.close();
  }
}

/**
 * A restored file is external data (ADR-013): the chains between accounts are
 * checked as they are on every save. An archived account may keep a stale
 * target, as the app allows, so only the active ones are held to it.
 */
function assertOverflowChainsValid(candidate: Database.Database): void {
  const rows = candidate
    .prepare<[], { id: number; currency: string; kind: string; archived: number; overflowAccountId: number | null }>(
      "select id, kind, currency, archived, overflow_account_id as overflowAccountId from accounts",
    )
    .all();
  const links: OverflowLink[] = rows.map((row) => ({ ...row, archived: row.archived === 1 }));
  try {
    for (const link of links) {
      if (!link.archived && link.overflowAccountId !== null) {
        assertOverflowTargetAllowed(link, link.overflowAccountId, links);
      }
    }
  } catch (error) {
    if (error instanceof AccountValidationError) {
      throw new BackupError("invalidOverflowChain");
    }
    throw error;
  }
}

/**
 * Plain copies of the data never go to the system temp directory: they live in
 * a private folder next to the database, on the same volume, and are removed.
 */
async function withScratchDirectory<T>(
  db: AppDatabase,
  work: (directory: string) => Promise<T>,
): Promise<T> {
  const directory = await mkdtemp(path.join(path.dirname(db.$client.name), SCRATCH_DIR_PREFIX));
  try {
    return await work(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
