import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export const accounts = sqliteTable("accounts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  kind: text("kind", { enum: ["checking", "savings", "other"] }).notNull(),
  currency: text("currency").notNull(),
  // Calendar date as YYYY-MM-DD, without time or timezone.
  openingDate: text("opening_date").notNull(),
  // Signed integer in minor units.
  openingBalance: integer("opening_balance").notNull(),
  archived: integer("archived", { mode: "boolean" }).notNull().default(false),
});
