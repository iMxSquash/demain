import { eq } from "drizzle-orm";

import type { AppDatabase } from "../storage/database";
import { settings } from "../storage/schema";

export function readSetting(db: AppDatabase, key: string): string | undefined {
  return db.select().from(settings).where(eq(settings.key, key)).get()?.value;
}

export function writeSetting(db: AppDatabase, key: string, value: string): void {
  db.insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } })
    .run();
}
