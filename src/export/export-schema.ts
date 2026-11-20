import { z } from "zod";

/*
 * The JSON export format, version 2. This schema is the single definition:
 * docs/export.schema.json is generated from it (see docs/BACKUPS.md) and a
 * test keeps the two in step. Any change to a field is a new schemaVersion.
 */
export const EXPORT_FORMAT = "demain-export";
export const EXPORT_SCHEMA_VERSION = 2;

const id = z.int().positive();
const calendarDate = z.iso.date().describe("Calendar date, YYYY-MM-DD, without time or timezone.");
const currencyCode = z.string().regex(/^[A-Z]{3}$/).describe("ISO 4217 currency code.");

const money = z
  .strictObject({
    minorUnits: z
      .int()
      .describe("Signed integer in the minor unit of the currency (cents for EUR). Never a decimal."),
    currency: currencyCode,
  })
  .describe("An amount with its currency.");

const account = z.strictObject({
  id,
  name: z.string(),
  kind: z.enum(["checking", "savings", "other"]),
  currency: currencyCode,
  openingDate: calendarDate,
  openingBalance: money,
  archived: z.boolean(),
  depositCeiling: money.nullable().describe("Null: no ceiling."),
  overflowAccountId: id.nullable().describe("Account receiving what does not fit under the ceiling."),
});

const category = z.strictObject({
  id,
  name: z.string(),
  icon: z.string().describe("A key of the closed set of category icons, such as \"basket\"."),
  archived: z.boolean(),
});

const categorizationRule = z.strictObject({
  id,
  operator: z.enum(["contains", "starts_with", "equals"]),
  value: z.string(),
  accountId: id.nullable().describe("Null: the rule applies to every account."),
  categoryId: id,
  priority: z.int().describe("Lower comes first: the first matching rule wins."),
});

const importBatch = z.strictObject({
  id,
  accountId: id,
  format: z.enum(["csv", "ofx"]),
  importedAt: z.iso.datetime().describe("ISO 8601 instant, UTC."),
  fileName: z.string(),
  mapping: z.string().nullable().describe("CSV only: the column mapping, as a JSON text."),
});

const transaction = z.strictObject({
  id,
  accountId: id,
  date: calendarDate,
  amount: money.describe("Negative leaves the account. In the currency of the account."),
  kind: z.enum(["expense", "income", "interest", "transfer"]),
  label: z.string(),
  description: z.string().nullable(),
  paymentMode: z.enum(["card", "transfer", "direct_debit"]).nullable(),
  categoryId: id.nullable().describe("Null: waiting in the to-categorize queue. A transfer has none."),
  transferCounterpartId: id.nullable().describe("The other leg of a transfer."),
  importBatchId: id.nullable(),
  plannedItemId: id
    .nullable()
    .describe("The planned item whose occurrence this transaction settles. Null: not matched."),
  occurrenceDate: calendarDate
    .nullable()
    .describe("Nominal date of the settled occurrence. Null exactly when plannedItemId is null."),
  categoryFromPlannedItem: z
    .boolean()
    .describe("True when the category was taken from the planned item rather than chosen."),
});

const plannedItem = z
  .strictObject({
    id,
    name: z.string(),
    kind: z.enum(["expense", "income", "interest", "transfer"]),
    accountId: id,
    destinationAccountId: id.nullable().describe("Transfers only: the account that receives."),
    categoryId: id.nullable(),
    startDate: calendarDate.describe("Lower bound: nothing is planned before this date."),
    endDate: calendarDate.nullable().describe("Null: no end."),
    acceptsMultipleTransactions: z.boolean(),
    provisionLabelFilter: z.string().nullable(),
    matchWindowDays: z.int().describe("Days around the nominal date in which a transaction may match."),
    matchAmountToleranceBp: z
      .int()
      .describe("Amount tolerance of the matching in basis points, 500 is 5 percent."),
    cancelled: z.boolean(),
  })
  .describe("A dated item of the plan. Its occurrences are computed, never exported.");

const plannedItemVersion = z
  .strictObject({
    id,
    plannedItemId: id,
    effectiveFrom: calendarDate.describe("First nominal date this version applies to."),
    repetitionKind: z
      .enum([
        "monthly_on_day",
        "monthly_on_last_day",
        "every_n_months",
        "quarterly",
        "yearly",
        "every_n_weeks",
      ])
      .nullable()
      .describe("Null: a single event."),
    repetitionValue: z.int().nullable().describe("Day of the month or interval, by kind."),
    businessDayRule: z.enum(["none", "previous", "next"]),
    amount: money.describe(
      "In the currency of the account of the item. With a rolling average, the starting estimate.",
    ),
    amountMode: z.enum(["fixed", "rolling_average"]),
    averageWindow: z.int().describe("Number of past payments averaged: 3, 6 or 12."),
  })
  .describe("The schedule and amount of a planned item from a date on.");

const occurrenceOverride = z
  .strictObject({
    id,
    plannedItemId: id,
    nominalDate: calendarDate.describe("Identifies the occurrence the override applies to."),
    status: z.enum(["cancelled", "modified"]),
    overrideDate: calendarDate.nullable(),
    overrideAmount: money.nullable(),
  })
  .describe("A change to one occurrence of a planned item.");

const balanceAssertion = z.strictObject({
  id,
  accountId: id,
  date: calendarDate,
  amount: money.describe("The real balance observed at the bank, end of day."),
  note: z.string().nullable(),
});

const exchangeRate = z.strictObject({
  id,
  date: calendarDate,
  base: currencyCode,
  quote: currencyCode,
  rate: z
    .int()
    .positive()
    .describe("Exact scaled integer: 1 base is worth rate / 100000000 quote."),
  source: z.enum(["manual", "ecb"]),
});

const setting = z.strictObject({ key: z.string(), value: z.string() });

export const exportSchema = z
  .strictObject({
    format: z.literal(EXPORT_FORMAT),
    schemaVersion: z.literal(EXPORT_SCHEMA_VERSION),
    exportedAt: z.iso.datetime().describe("ISO 8601 instant, UTC."),
    settings: z.array(setting),
    accounts: z.array(account),
    categories: z.array(category),
    categorizationRules: z.array(categorizationRule),
    importBatches: z.array(importBatch),
    plannedItems: z.array(plannedItem),
    plannedItemVersions: z.array(plannedItemVersion),
    occurrenceOverrides: z.array(occurrenceOverride),
    transactions: z.array(transaction),
    balanceAssertions: z.array(balanceAssertion),
    exchangeRates: z.array(exchangeRate),
  })
  .describe(
    "Everything Demain holds except the credentials of the account (password hash, second factor, sessions).",
  );

export type DemainExport = z.infer<typeof exportSchema>;
export type Money = z.infer<typeof money>;
