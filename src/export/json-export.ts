import { asc } from "drizzle-orm";

import type { AppDatabase } from "../storage/database";
import {
  accounts,
  balanceAssertions,
  categories,
  categorizationRules,
  exchangeRates,
  importBatches,
  settings,
  transactions,
} from "../storage/schema";
import { encryptPayload } from "./envelope";
import {
  EXPORT_FORMAT,
  EXPORT_SCHEMA_VERSION,
  exportSchema,
  type DemainExport,
  type Money,
} from "./export-schema";

const JSON_INDENT = 2;

/**
 * A readable copy of the data for leaving Demain or inspecting it. With a
 * password the file is encrypted like a snapshot; without one it is plain
 * JSON, which the interface warns about. The credentials of the account are
 * never part of it. It cannot be restored: that goes through the snapshot.
 */
export async function createJsonExport(
  db: AppDatabase,
  now: Date,
  password?: string,
): Promise<Buffer> {
  const document = buildExport(db, now);
  // Parsing the result guards the published format against drift in this file.
  const text = JSON.stringify(exportSchema.parse(document), null, JSON_INDENT);
  const bytes = Buffer.from(text, "utf8");
  return password === undefined ? bytes : encryptPayload(bytes, password, "json-export");
}

type MoneyOf = (accountId: number, minorUnits: number) => Money;

function buildExport(db: AppDatabase, now: Date): DemainExport {
  const moneyOf = createMoneyBuilder(db);
  return {
    format: EXPORT_FORMAT,
    schemaVersion: EXPORT_SCHEMA_VERSION,
    exportedAt: now.toISOString(),
    settings: db.select().from(settings).orderBy(asc(settings.key)).all(),
    accounts: exportAccounts(db, moneyOf),
    categories: db.select().from(categories).orderBy(asc(categories.id)).all(),
    categorizationRules: db
      .select()
      .from(categorizationRules)
      .orderBy(asc(categorizationRules.id))
      .all(),
    importBatches: exportImportBatches(db),
    transactions: exportTransactions(db, moneyOf),
    balanceAssertions: exportBalanceAssertions(db, moneyOf),
    exchangeRates: db.select().from(exchangeRates).orderBy(asc(exchangeRates.id)).all(),
  };
}

/** An amount is exported with the currency of its account, which every amount belongs to. */
function createMoneyBuilder(db: AppDatabase): MoneyOf {
  const currencyByAccount = new Map(
    db
      .select({ id: accounts.id, currency: accounts.currency })
      .from(accounts)
      .all()
      .map((row) => [row.id, row.currency]),
  );
  return (accountId, minorUnits) => {
    const currency = currencyByAccount.get(accountId);
    if (currency === undefined) {
      throw new Error(`Cannot export an amount of the unknown account ${accountId}`);
    }
    return { minorUnits, currency };
  };
}

function exportAccounts(db: AppDatabase, moneyOf: MoneyOf): DemainExport["accounts"] {
  return db
    .select()
    .from(accounts)
    .orderBy(asc(accounts.id))
    .all()
    .map((row) => ({
      id: row.id,
      name: row.name,
      kind: row.kind,
      currency: row.currency,
      openingDate: row.openingDate,
      openingBalance: moneyOf(row.id, row.openingBalance),
      archived: row.archived,
      depositCeiling: row.depositCeiling === null ? null : moneyOf(row.id, row.depositCeiling),
      overflowAccountId: row.overflowAccountId,
    }));
}

// The content digest only guards the undo of a batch: like the fingerprints it
// is an internal key, and it is left out.
function exportImportBatches(db: AppDatabase): DemainExport["importBatches"] {
  return db
    .select()
    .from(importBatches)
    .orderBy(asc(importBatches.id))
    .all()
    .map((row) => ({
      id: row.id,
      accountId: row.accountId,
      format: row.format,
      importedAt: row.importedAt,
      fileName: row.fileName,
      mapping: row.mapping,
    }));
}

// The import fingerprints are internal keys for spotting a movement imported
// twice: they say nothing about the data and are left out.
function exportTransactions(db: AppDatabase, moneyOf: MoneyOf): DemainExport["transactions"] {
  return db
    .select()
    .from(transactions)
    .orderBy(asc(transactions.id))
    .all()
    .map((row) => ({
      id: row.id,
      accountId: row.accountId,
      date: row.date,
      amount: moneyOf(row.accountId, row.amount),
      kind: row.kind,
      label: row.label,
      description: row.description,
      paymentMode: row.paymentMode,
      categoryId: row.categoryId,
      transferCounterpartId: row.transferCounterpartId,
      importBatchId: row.importBatchId,
    }));
}

function exportBalanceAssertions(
  db: AppDatabase,
  moneyOf: MoneyOf,
): DemainExport["balanceAssertions"] {
  return db
    .select()
    .from(balanceAssertions)
    .orderBy(asc(balanceAssertions.id))
    .all()
    .map((row) => ({
      id: row.id,
      accountId: row.accountId,
      date: row.date,
      amount: moneyOf(row.accountId, row.amount),
      note: row.note,
    }));
}
