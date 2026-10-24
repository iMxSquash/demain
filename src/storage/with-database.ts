import { openDatabase, type AppDatabase } from "./database";
import { parseEnv } from "./env";

/**
 * Runs `work` on a short-lived connection. Opening SQLite is cheap, and a
 * connection per request avoids sharing a handle between Next.js workers.
 * Migrations have already been applied at startup (see instrumentation).
 */
export function withDatabase<T>(work: (db: AppDatabase) => T): T {
  const env = parseEnv(process.env);
  const db = openDatabase(env.DEMAIN_DATA_DIR);
  try {
    return work(db);
  } finally {
    db.$client.close();
  }
}

/** Same as `withDatabase` for work that awaits, such as password hashing. */
export async function withDatabaseAsync<T>(
  work: (db: AppDatabase) => Promise<T>,
): Promise<T> {
  const env = parseEnv(process.env);
  const db = openDatabase(env.DEMAIN_DATA_DIR);
  try {
    return await work(db);
  } finally {
    db.$client.close();
  }
}
