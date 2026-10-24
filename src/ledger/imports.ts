import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import {
  CSV_DATE_FORMATS,
  CSV_DELIMITERS,
  type CsvMapping,
} from "../domain/import-csv";
import { fingerprintRows, type ImportedRow } from "../domain/import-row";
import {
  ceilingWarningFor,
  validateTransactionInput,
  type ValidTransactionInput,
} from "../domain/transaction";
import type { AppDatabase } from "../storage/database";
import { importBatches, transactions } from "../storage/schema";
import { getAccount, getAccountBalance } from "./accounts";

export type ImportBatch = typeof importBatches.$inferSelect;

export type ImportFormat = ImportBatch["format"];

// Keeps each query under SQLite's limit on bound variables.
const FINGERPRINT_CHUNK_SIZE = 500;
// 10 bound columns per row: 100 rows stay far below SQLite's variable limit.
const INSERT_CHUNK_SIZE = 100;

const column = z.number().int().min(0);

const csvMappingSchema: z.ZodType<CsvMapping> = z.object({
  delimiter: z.enum(CSV_DELIMITERS),
  hasHeader: z.boolean(),
  dateColumn: column,
  dateFormat: z.enum(CSV_DATE_FORMATS),
  labelColumn: column,
  amount: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("single"), column }),
    z.object({
      kind: z.literal("split"),
      debitColumn: column,
      creditColumn: column,
    }),
  ]),
});

export interface CeilingExcess {
  label: string;
  date: string;
  /** Minor units above the ceiling once the row is counted. */
  excess: number;
}

export interface ImportPreview {
  newCount: number;
  duplicateCount: number;
  ceilingWarnings: CeilingExcess[];
  accountArchived: boolean;
}

export interface ImportRequest {
  accountId: number;
  rows: readonly ImportedRow[];
}

export interface CommitImportRequest extends ImportRequest {
  format: ImportFormat;
  fileName: string;
  /** The mapping used, for a CSV file: offered again at the next import. */
  mapping: CsvMapping | null;
  now: Date;
}

export interface ImportResult extends ImportPreview {
  /** Null when every row was already there: no batch is recorded for nothing. */
  batchId: number | null;
}

interface ImportPlan extends ImportPreview {
  /** The rows to record, validated once, with their fingerprint. */
  fresh: { input: ValidTransactionInput; fingerprint: string }[];
}

function findKnownFingerprints(
  db: AppDatabase,
  accountId: number,
  fingerprints: readonly string[],
): Set<string> {
  const known = new Set<string>();
  for (
    let start = 0;
    start < fingerprints.length;
    start += FINGERPRINT_CHUNK_SIZE
  ) {
    const chunk = fingerprints.slice(start, start + FINGERPRINT_CHUNK_SIZE);
    const found = db
      .select({ fingerprint: transactions.importFingerprint })
      .from(transactions)
      .where(
        and(
          eq(transactions.accountId, accountId),
          inArray(transactions.importFingerprint, chunk),
        ),
      )
      .all();
    for (const { fingerprint } of found) {
      if (fingerprint !== null) known.add(fingerprint);
    }
  }
  return known;
}

function toTransactionInput(
  accountId: number,
  row: ImportedRow,
): ValidTransactionInput {
  return validateTransactionInput({
    accountId,
    date: row.date,
    amount: row.amount,
    kind: row.amount > 0 ? "income" : "expense",
    label: row.label,
  });
}

// An imported movement already happened: it is never refused, only reported.
function findCeilingExcesses(
  inputs: readonly ValidTransactionInput[],
  balance: number,
  ceiling: number | null,
): CeilingExcess[] {
  if (ceiling === null) return [];
  const warnings: CeilingExcess[] = [];
  let running = balance;
  // ISO dates sort as text; the sort is stable, so rows of one day keep the file order.
  const byDate = [...inputs].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
  );
  for (const input of byDate) {
    const warning = ceilingWarningFor(input, { balance: running, ceiling });
    if (warning !== null) {
      warnings.push({
        label: input.label,
        date: input.date,
        excess: warning.excess,
      });
    }
    running += input.amount;
  }
  return warnings;
}

function planImport(db: AppDatabase, request: ImportRequest): ImportPlan {
  const account = getAccount(db, request.accountId);
  const fingerprinted = fingerprintRows(request.rows);
  const known = findKnownFingerprints(
    db,
    account.id,
    fingerprinted.map((row) => row.fingerprint),
  );
  const fresh = fingerprinted
    .filter((row) => !known.has(row.fingerprint))
    .map((row) => ({
      input: toTransactionInput(account.id, row),
      fingerprint: row.fingerprint,
    }));

  return {
    fresh,
    newCount: fresh.length,
    duplicateCount: fingerprinted.length - fresh.length,
    ceilingWarnings: findCeilingExcesses(
      fresh.map((entry) => entry.input),
      getAccountBalance(db, account.id),
      account.depositCeiling,
    ),
    accountArchived: account.archived,
  };
}

/** What an import would do, without writing anything. */
export function previewImport(
  db: AppDatabase,
  request: ImportRequest,
): ImportPreview {
  const plan = planImport(db, request);
  return {
    newCount: plan.newCount,
    duplicateCount: plan.duplicateCount,
    ceilingWarnings: plan.ceilingWarnings,
    accountArchived: plan.accountArchived,
  };
}

/**
 * Records the rows that are not already known as transactions waiting for a
 * category, under one batch, all or nothing. An archived account and a ceiling
 * exceeded do not refuse the import (DOMAIN, imports are the exception).
 */
export function commitImport(
  db: AppDatabase,
  request: CommitImportRequest,
): ImportResult {
  const { fresh, ...preview } = planImport(db, request);
  if (fresh.length === 0) return { ...preview, batchId: null };

  // The unique fingerprint index backs the plan: an identical import running
  // at the same time fails here and rolls back instead of duplicating.
  return db.transaction((tx) => {
    const batch = tx
      .insert(importBatches)
      .values({
        accountId: request.accountId,
        format: request.format,
        importedAt: request.now.toISOString(),
        fileName: request.fileName,
        mapping:
          request.mapping === null ? null : JSON.stringify(request.mapping),
      })
      .returning()
      .get();

    for (let start = 0; start < fresh.length; start += INSERT_CHUNK_SIZE) {
      tx.insert(transactions)
        .values(
          fresh
            .slice(start, start + INSERT_CHUNK_SIZE)
            .map(({ input, fingerprint }) => ({
              ...input,
              importBatchId: batch.id,
              importFingerprint: fingerprint,
            })),
        )
        .run();
    }
    return { ...preview, batchId: batch.id };
  });
}

export function listImportBatches(
  db: AppDatabase,
  accountId: number,
): ImportBatch[] {
  return db
    .select()
    .from(importBatches)
    .where(eq(importBatches.accountId, accountId))
    .orderBy(desc(importBatches.id))
    .all();
}

/**
 * The mapping of the latest CSV import on the account. Stored data is
 * validated on load: a mapping that no longer fits is dropped, not trusted.
 */
export function getLastCsvMapping(
  db: AppDatabase,
  accountId: number,
): CsvMapping | null {
  const latest = db
    .select({ mapping: importBatches.mapping })
    .from(importBatches)
    .where(
      and(
        eq(importBatches.accountId, accountId),
        eq(importBatches.format, "csv"),
      ),
    )
    .orderBy(desc(importBatches.id))
    .limit(1)
    .get();
  if (latest?.mapping == null) return null;

  try {
    const parsed = csvMappingSchema.safeParse(JSON.parse(latest.mapping));
    return parsed.success ? parsed.data : null;
  } catch (error) {
    if (error instanceof SyntaxError) return null;
    throw error;
  }
}
