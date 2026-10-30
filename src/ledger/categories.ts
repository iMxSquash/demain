import { asc, eq } from "drizzle-orm";

import {
  assertCategoryNameAvailable,
  validateCategoryName,
} from "../domain/category";
import type { AppDatabase } from "../storage/database";
import { categories } from "../storage/schema";

export type Category = typeof categories.$inferSelect;

export class CategoryNotFoundError extends Error {
  constructor(id: number) {
    super(`Category ${id} does not exist`);
    this.name = "CategoryNotFoundError";
  }
}

export function getCategory(db: AppDatabase, id: number): Category {
  const category = db
    .select()
    .from(categories)
    .where(eq(categories.id, id))
    .get();
  if (category === undefined) {
    throw new CategoryNotFoundError(id);
  }
  return category;
}

export function listCategories(
  db: AppDatabase,
  { includeArchived = false }: { includeArchived?: boolean } = {},
): Category[] {
  const query = db.select().from(categories);
  const rows = includeArchived
    ? query
    : query.where(eq(categories.archived, false));
  // SQLite gives no order guarantee without ORDER BY: keep creation order.
  return rows.orderBy(asc(categories.id)).all();
}

// Archived categories count: homonyms must not coexist in the history.
function checkedName(db: AppDatabase, name: string, ignoreId?: number): string {
  const valid = validateCategoryName(name);
  assertCategoryNameAvailable(
    valid,
    listCategories(db, { includeArchived: true }),
    { ignoreId },
  );
  return valid;
}

export function createCategory(
  db: AppDatabase,
  input: { name: string },
): Category {
  const name = checkedName(db, input.name);
  return db.insert(categories).values({ name }).returning().get();
}

export function renameCategory(
  db: AppDatabase,
  id: number,
  input: { name: string },
): Category {
  getCategory(db, id);
  const name = checkedName(db, input.name, id);
  return db
    .update(categories)
    .set({ name })
    .where(eq(categories.id, id))
    .returning()
    .get();
}

/** A category is archived, never deleted: its transactions keep it. */
export function archiveCategory(db: AppDatabase, id: number): void {
  getCategory(db, id);
  db.update(categories).set({ archived: true }).where(eq(categories.id, id)).run();
}

/**
 * An archived category is offered again and its rules apply again. It never
 * conflicts on its name, since names are unique archived categories included.
 */
export function reactivateCategory(db: AppDatabase, id: number): Category {
  getCategory(db, id);
  return db
    .update(categories)
    .set({ archived: false })
    .where(eq(categories.id, id))
    .returning()
    .get();
}
