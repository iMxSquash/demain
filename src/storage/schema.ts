import { sql } from "drizzle-orm";
import {
  integer,
  sqliteTable,
  text,
  uniqueIndex,
  type AnySQLiteColumn,
} from "drizzle-orm/sqlite-core";

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
  // Maximum balance reachable through deposits, in minor units. Null: no ceiling.
  depositCeiling: integer("deposit_ceiling"),
  // Receives what does not fit under the ceiling. Restrict: a referenced
  // account can never be deleted (DOMAIN, protection of the chain).
  overflowAccountId: integer("overflow_account_id").references(
    (): AnySQLiteColumn => accounts.id,
    { onDelete: "restrict" },
  ),
});

export const categories = sqliteTable(
  "categories",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    // Hidden from pickers but kept for history: never deleted.
    archived: integer("archived", { mode: "boolean" }).notNull().default(false),
  },
  (table) => [
    // Names are unique regardless of case, archived categories included: the
    // application checks it first, this is the guarantee behind it.
    uniqueIndex("categories_name_unique").on(sql`lower(${table.name})`),
  ],
);

export const importBatches = sqliteTable("import_batches", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  // Restrict: an account with imports is archived, never deleted.
  accountId: integer("account_id")
    .notNull()
    .references(() => accounts.id, { onDelete: "restrict" }),
  format: text("format", { enum: ["csv", "ofx"] }).notNull(),
  // ISO 8601 instant, UTC.
  importedAt: text("imported_at").notNull(),
  // Name as the browser sent it: untrusted text, only ever displayed escaped.
  fileName: text("file_name").notNull(),
  // CSV only: the column mapping as JSON, offered again at the next import.
  mapping: text("mapping"),
});

export const transactions = sqliteTable(
  "transactions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    // Restrict: an account with history is archived, never deleted.
    accountId: integer("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "restrict" }),
    // Booking date as YYYY-MM-DD, without time or timezone.
    date: text("date").notNull(),
    // Signed integer in minor units: negative leaves the account.
    amount: integer("amount").notNull(),
    kind: text("kind", {
      enum: ["expense", "income", "interest", "transfer"],
    }).notNull(),
    label: text("label").notNull(),
    description: text("description"),
    paymentMode: text("payment_mode", {
      enum: ["card", "transfer", "direct_debit"],
    }),
    // Null: the transaction is in the to-categorize queue. A transfer has none.
    categoryId: integer("category_id").references(() => categories.id, {
      onDelete: "restrict",
    }),
    // The other leg of a transfer. Both legs are deleted together.
    transferCounterpartId: integer("transfer_counterpart_id").references(
      (): AnySQLiteColumn => transactions.id,
    ),
    // Set for a transaction created by an import. Deleting a batch is not offered.
    importBatchId: integer("import_batch_id").references(
      () => importBatches.id,
      {
        onDelete: "restrict",
      },
    ),
    // Detects the same movement imported twice, see DOMAIN entity Transaction.
    importFingerprint: text("import_fingerprint"),
    // Date, amount and label of an imported movement, kept even when the bank gave an
    // identifier, to recognize the same movement exported again in another format.
    importContentKey: text("import_content_key"),
  },
  (table) => [
    // The guarantee behind the application check: one movement, one row per
    // account. Manual transactions have no fingerprint and are not constrained.
    uniqueIndex("transactions_import_fingerprint_unique")
      .on(table.accountId, table.importFingerprint)
      .where(sql`${table.importFingerprint} is not null`),
  ],
);
