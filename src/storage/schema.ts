import {
  integer,
  sqliteTable,
  text,
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

export const transactions = sqliteTable("transactions", {
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
  // The other leg of a transfer. Both legs are deleted together.
  transferCounterpartId: integer("transfer_counterpart_id").references(
    (): AnySQLiteColumn => transactions.id,
  ),
});
