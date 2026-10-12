import { migrateDatabase, openDatabase } from "./storage/database";
import { EnvError, parseEnv } from "./storage/env";

// Fail fast: a missing variable or a failed migration must stop the process.
// Throwing from register() would leave the server up and answering 500.
export function initializeStorage(): void {
  try {
    const env = parseEnv(process.env);
    const db = openDatabase(env.DEMAIN_DATA_DIR);
    try {
      migrateDatabase(db);
    } finally {
      db.$client.close();
    }
  } catch (error) {
    console.error(error instanceof EnvError ? error.message : error);
    process.exit(1);
  }
}
