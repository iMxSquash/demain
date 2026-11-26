import { sql } from "drizzle-orm";
import {
  check,
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
  overflowAccountId: integer("overflow_account_id").references((): AnySQLiteColumn => accounts.id, {
    onDelete: "restrict",
  }),
});

export const categories = sqliteTable(
  "categories",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    // A key of `CATEGORY_ICONS`: the application checks it, the default fills the categories
    // that existed before icons.
    icon: text("icon").notNull().default("tag"),
    // Hidden from pickers but kept for history: never deleted.
    archived: integer("archived", { mode: "boolean" }).notNull().default(false),
  },
  (table) => [
    // Names are unique regardless of case, archived categories included: the
    // application checks it first, this is the guarantee behind it.
    uniqueIndex("categories_name_unique").on(sql`lower(${table.name})`),
  ],
);

export const categorizationRules = sqliteTable("categorization_rules", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  operator: text("operator", {
    enum: ["contains", "starts_with", "equals"],
  }).notNull(),
  value: text("value").notNull(),
  // Null: the rule applies to every account.
  accountId: integer("account_id").references(() => accounts.id, {
    onDelete: "restrict",
  }),
  categoryId: integer("category_id")
    .notNull()
    .references(() => categories.id, { onDelete: "restrict" }),
  // Lower comes first: the first matching rule wins.
  priority: integer("priority").notNull(),
});

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
  // SHA-256 of the transactions of the batch as recorded: the undo is allowed
  // only while they still hash to it. Null for a batch recorded before it existed.
  contentDigest: text("content_digest"),
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
    // Set for a transaction created by an import. A batch row is removed only by
    // undoImportBatch, which first checks the digest so that nothing edited is lost.
    importBatchId: integer("import_batch_id").references(() => importBatches.id, {
      onDelete: "restrict",
    }),
    // Detects the same movement imported twice, see DOMAIN entity Transaction.
    importFingerprint: text("import_fingerprint"),
    // Date, amount and label of an imported movement, kept even when the bank gave an
    // identifier, to recognize the same movement exported again in another format.
    importContentKey: text("import_content_key"),
    // The planned item and the nominal date of the occurrence this transaction settles. Both are
    // null or both are set (DOMAIN, invariant 5); the matching writes them.
    plannedItemId: integer("planned_item_id").references(() => plannedItems.id, {
      onDelete: "restrict",
    }),
    occurrenceDate: text("occurrence_date"),
    // True when the category was inherited from the planned item by a match, so that undoing
    // the match can clear it. A change of category by hand sets it back to false.
    categoryFromPlannedItem: integer("category_from_planned_item", { mode: "boolean" })
      .notNull()
      .default(false),
  },
  (table) => [
    // The guarantee behind the application check: one movement, one row per
    // account. Manual transactions have no fingerprint and are not constrained.
    uniqueIndex("transactions_import_fingerprint_unique")
      .on(table.accountId, table.importFingerprint)
      .where(sql`${table.importFingerprint} is not null`),
  ],
);

// What the user plans: a repetition rule with its versions, never the occurrences, which are
// generated (DOMAIN, invariant 4).
export const plannedItems = sqliteTable("planned_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  kind: text("kind", {
    enum: ["expense", "income", "interest", "transfer"],
  }).notNull(),
  // Restrict: an account with planned items is archived, never deleted.
  accountId: integer("account_id")
    .notNull()
    .references(() => accounts.id, { onDelete: "restrict" }),
  // Only for a transfer: the account that receives the amount.
  destinationAccountId: integer("destination_account_id").references(() => accounts.id, {
    onDelete: "restrict",
  }),
  categoryId: integer("category_id").references(() => categories.id, {
    onDelete: "restrict",
  }),
  // Calendar dates as YYYY-MM-DD, without time or timezone.
  startDate: text("start_date").notNull(),
  endDate: text("end_date"),
  // True for a provision: several transactions settle one occurrence.
  acceptsMultipleTransactions: integer("accepts_multiple_transactions", { mode: "boolean" })
    .notNull()
    .default(false),
  provisionLabelFilter: text("provision_label_filter"),
  matchWindowDays: integer("match_window_days").notNull().default(5),
  // Basis points, so that no percentage is ever a float: 500 is 5%.
  matchAmountToleranceBp: integer("match_amount_tolerance_bp").notNull().default(500),
  cancelled: integer("cancelled", { mode: "boolean" }).notNull().default(false),
});

// A version applies from `effective_from` until the next one.
export const plannedItemVersions = sqliteTable(
  "planned_item_versions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    plannedItemId: integer("planned_item_id")
      .notNull()
      .references(() => plannedItems.id, { onDelete: "restrict" }),
    effectiveFrom: text("effective_from").notNull(),
    // Null: a one-off event. The values are the `kind` strings of `Repetition`.
    repetitionKind: text("repetition_kind", {
      enum: [
        "monthly_on_day",
        "monthly_on_last_day",
        "every_n_months",
        "quarterly",
        "yearly",
        "every_n_weeks",
      ],
    }),
    // The day, the months or the weeks, depending on the kind.
    repetitionValue: integer("repetition_value"),
    businessDayRule: text("business_day_rule", { enum: ["none", "previous", "next"] })
      .notNull()
      .default("none"),
    // Signed integer in minor units.
    amount: integer("amount").notNull(),
    amountMode: text("amount_mode", { enum: ["fixed", "rolling_average"] })
      .notNull()
      .default("fixed"),
    averageWindow: integer("average_window").notNull().default(3),
  },
  (table) => [
    uniqueIndex("planned_item_versions_item_effective_unique").on(
      table.plannedItemId,
      table.effectiveFrom,
    ),
  ],
);

// The single occurrences the user changed. Occurrences themselves are never stored.
export const occurrenceOverrides = sqliteTable(
  "occurrence_overrides",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    plannedItemId: integer("planned_item_id")
      .notNull()
      .references(() => plannedItems.id, { onDelete: "restrict" }),
    // The date computed by the rule: the identity of the occurrence.
    nominalDate: text("nominal_date").notNull(),
    status: text("status", { enum: ["cancelled", "modified"] }).notNull(),
    overrideDate: text("override_date"),
    // Signed integer in minor units.
    overrideAmount: integer("override_amount"),
  },
  (table) => [
    uniqueIndex("occurrence_overrides_item_nominal_unique").on(
      table.plannedItemId,
      table.nominalDate,
    ),
  ],
);

// A real balance observed at the bank. One per account and day: recording the
// same day again replaces the earlier value.
export const balanceAssertions = sqliteTable(
  "balance_assertions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    // Restrict: an account with history is archived, never deleted.
    accountId: integer("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "restrict" }),
    // Calendar date as YYYY-MM-DD, end of day.
    date: text("date").notNull(),
    // Signed integer in minor units.
    amount: integer("amount").notNull(),
    note: text("note"),
  },
  (table) => [
    uniqueIndex("balance_assertions_account_date_unique").on(table.accountId, table.date),
  ],
);

// 1 `base` is worth `rate / 10^8` `quote`. One rate per pair and day: entering
// the same day again replaces it.
export const exchangeRates = sqliteTable(
  "exchange_rates",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    // Calendar date of validity as YYYY-MM-DD.
    date: text("date").notNull(),
    base: text("base").notNull(),
    quote: text("quote").notNull(),
    // Exact scaled integer, never a float (ADR-007).
    rate: integer("rate").notNull(),
    source: text("source", { enum: ["manual", "ecb"] }).notNull(),
  },
  (table) => [
    uniqueIndex("exchange_rates_pair_date_unique").on(table.base, table.quote, table.date),
    check("exchange_rates_rate_positive", sql`${table.rate} > 0`),
    check("exchange_rates_distinct_currencies", sql`${table.base} <> ${table.quote}`),
  ],
);

// The single account of the instance. The check makes a second row impossible
// even if the application guard around the setup token were bypassed.
export const owner = sqliteTable(
  "owner",
  {
    id: integer("id").primaryKey(),
    // argon2id hash in PHC format.
    passwordHash: text("password_hash").notNull(),
    // Base32 secret, stored in clear: encryption at rest is delegated to the
    // host (ADR-005). Null: TOTP is not enabled.
    totpSecret: text("totp_secret"),
    // Last accepted TOTP time step, so a code cannot be used twice.
    totpLastStep: integer("totp_last_step"),
    // JSON array of SHA-256 hex hashes of the unused backup codes.
    backupCodeHashes: text("backup_code_hashes").notNull().default("[]"),
    // ISO 8601 instant, UTC.
    createdAt: text("created_at").notNull(),
  },
  (table) => [check("owner_single_row", sql`${table.id} = 1`)],
);

export const sessions = sqliteTable("sessions", {
  // SHA-256 hex of the cookie token: a copy of the database cannot be replayed.
  id: text("id").primaryKey(),
  // ISO 8601 instants, UTC.
  createdAt: text("created_at").notNull(),
  lastSeenAt: text("last_seen_at").notNull(),
  expiresAt: text("expires_at").notNull(),
  // True between the password step and the TOTP step: grants no access.
  mfaPending: integer("mfa_pending", { mode: "boolean" }).notNull().default(false),
});
