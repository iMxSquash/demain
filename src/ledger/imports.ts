import { and, desc, eq, inArray, or } from "drizzle-orm";
import { z } from "zod";

import {
  CSV_DATE_FORMATS,
  CSV_DELIMITERS,
  type CsvMapping,
} from "../domain/import-csv";
import { assertCategoryAssignable } from "../domain/category";
import {
  findMatchingRule,
  type CategorizationRule,
} from "../domain/categorization-rule";
import {
  checkRowDetails,
  type DetailsProblem,
  type RowDetails,
} from "../domain/import-draft";
import {
  fingerprintRows,
  type FingerprintedRow,
  type ImportedRow,
} from "../domain/import-row";
import {
  compareDates,
  planSavingsTransfers,
  type SavingsMovement,
  type SavingsPlanIssue,
  type SavingsTransfer,
} from "../domain/import-savings";
import type { MessageRef } from "../domain/message";
import type { OverflowAccount } from "../domain/overflow";
import {
  buildTransferLegs,
  ceilingWarningFor,
  TransactionValidationError,
  validateTransactionInput,
  type TransferLeg,
  type ValidTransactionInput,
} from "../domain/transaction";
import type { AppDatabase } from "../storage/database";
import { importBatches, transactions } from "../storage/schema";
import { getAccount, getAccountBalance, listOverflowAccounts } from "./accounts";
import { getCategory } from "./categories";
import { listApplicableRules } from "./categorization-rules";
import { insertTransferLegs, type LegImportColumns } from "./transactions";

export type ImportBatch = typeof importBatches.$inferSelect;

export type ImportFormat = ImportBatch["format"];

// Keeps each query under SQLite's limit on bound variables.
const KEY_CHUNK_SIZE = 500;
// 11 bound columns per row: 100 rows stay far below SQLite's variable limit.
const INSERT_CHUNK_SIZE = 100;

const column = z.number().int().min(0);

export const csvMappingSchema: z.ZodType<CsvMapping> = z.object({
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

/** A row of a file; with its details, the type and category the user chose. */
export type ImportRow = ImportedRow & { details?: RowDetails };

/** What stops a file: it is recorded whole or not at all. `index` is the position in the rows. */
export type ImportIssue =
  | SavingsPlanIssue
  /** The details contradict the amount, or a savings row names no savings account. */
  | { kind: "rowProblem"; index: number; problem: DetailsProblem }
  /** The ledger refuses the row. */
  | { kind: "rowInvalid"; index: number; ref: MessageRef };

export class ImportBlockedError extends Error {
  constructor(readonly issues: readonly ImportIssue[]) {
    super(`The import is blocked by ${issues.length} issue(s)`);
    this.name = "ImportBlockedError";
  }
}

export interface ImportPreview {
  newCount: number;
  duplicateCount: number;
  ceilingWarnings: CeilingExcess[];
  accountArchived: boolean;
  /** The savings rows that are new, planned along the overflow chain. */
  transfers: SavingsTransfer[];
  /** Linked pairs of transactions the import records. */
  transferCount: number;
  issues: ImportIssue[];
}

export interface ImportRequest {
  accountId: number;
  rows: readonly ImportRow[];
  /** The savings account of the savings rows that name none. */
  savingsAccountId?: number;
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

interface ImportKeys {
  fingerprint: string;
  contentKey: string;
}

interface FreshRow extends ImportKeys {
  input: ValidTransactionInput;
}

/** A savings row becomes pairs of legs; the keys sit on a leg of the first pair, on the account of the file. */
interface FreshTransfer {
  legs: [TransferLeg, TransferLeg];
  keys: ImportKeys | null;
  keyedLeg: 0 | 1;
}

interface ImportPlan {
  preview: ImportPreview;
  /** The rows to record, validated once, with their fingerprint. */
  fresh: FreshRow[];
  pairs: FreshTransfer[];
}

interface KnownKeys {
  /** Fingerprints of the stored movements: bank identifiers, or content keys when there was none. */
  fingerprints: Set<string>;
  /** Content keys of every stored movement. */
  contentKeys: Set<string>;
}

function findKnownKeys(
  db: AppDatabase,
  accountId: number,
  rows: readonly FingerprintedRow[],
): KnownKeys {
  const keys = [
    ...new Set(rows.flatMap((row) => [row.fingerprint, row.contentKey])),
  ];
  const known: KnownKeys = { fingerprints: new Set(), contentKeys: new Set() };
  for (let start = 0; start < keys.length; start += KEY_CHUNK_SIZE) {
    const chunk = keys.slice(start, start + KEY_CHUNK_SIZE);
    const found = db
      .select({
        fingerprint: transactions.importFingerprint,
        contentKey: transactions.importContentKey,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.accountId, accountId),
          or(
            inArray(transactions.importFingerprint, chunk),
            inArray(transactions.importContentKey, chunk),
          ),
        ),
      )
      .all();
    for (const { fingerprint, contentKey } of found) {
      if (fingerprint !== null) known.fingerprints.add(fingerprint);
      if (contentKey !== null) known.contentKeys.add(contentKey);
    }
  }
  return known;
}

// A bank identifier is authoritative against other identifiers. Against a stored
// movement that had none (a CSV export) only the content can be compared, and
// the other way round: a file without identifiers is compared with all stored content.
function isKnown(row: FingerprintedRow, known: KnownKeys): boolean {
  if (known.fingerprints.has(row.fingerprint)) return true;
  return row.externalId === null
    ? known.contentKeys.has(row.contentKey)
    : known.fingerprints.has(row.contentKey);
}

function toTransactionInput(
  accountId: number,
  row: ImportedRow,
  categoryId: number | null,
  kind: "expense" | "income",
  details?: RowDetails,
): ValidTransactionInput {
  return validateTransactionInput({
    accountId,
    date: row.date,
    amount: row.amount,
    kind,
    label: row.label,
    categoryId,
    description: details?.description,
    paymentMode: details?.paymentMode,
  });
}

/** What a row of the file does to the balance of the account that receives it. */
type BalanceFlow = Pick<ValidTransactionInput, "date" | "amount" | "label"> & {
  kind: ValidTransactionInput["kind"] | "transfer";
};

// An imported movement already happened: it is never refused, only reported.
function findCeilingExcesses(
  flows: readonly BalanceFlow[],
  balance: number,
  ceiling: number | null,
): CeilingExcess[] {
  if (ceiling === null) return [];
  const warnings: CeilingExcess[] = [];
  let running = balance;
  const byDate = [...flows].sort((a, b) => compareDates(a.date, b.date));
  for (const flow of byDate) {
    const warning = ceilingWarningFor(flow, { balance: running, ceiling });
    if (warning !== null) {
      warnings.push({
        label: flow.label,
        date: flow.date,
        excess: warning.excess,
      });
    }
    running += flow.amount;
  }
  return warnings;
}

function fingerprintWithDuplicateFlags(
  db: AppDatabase,
  request: ImportRequest,
): { row: FingerprintedRow; isDuplicate: boolean }[] {
  const fingerprinted = fingerprintRows(request.rows);
  const known = findKnownKeys(db, request.accountId, fingerprinted);
  return fingerprinted.map((row) => ({ row, isDuplicate: isKnown(row, known) }));
}

/** For each row, in order, whether the account already holds that movement. Writes nothing. */
export function findDuplicateRows(
  db: AppDatabase,
  request: ImportRequest,
): boolean[] {
  return fingerprintWithDuplicateFlags(db, request).map(
    ({ isDuplicate }) => isDuplicate,
  );
}

// The category the user chose, which must be assignable, else the first rule that matches.
function categoryOf(
  db: AppDatabase,
  accountId: number,
  row: ImportedRow,
  kind: "expense" | "income",
  details: RowDetails | undefined,
  rules: readonly CategorizationRule[],
): number | null {
  if (details?.categoryId != null) {
    assertCategoryAssignable(kind, getCategory(db, details.categoryId));
    return details.categoryId;
  }
  return findMatchingRule(rules, { label: row.label, accountId })?.categoryId ?? null;
}

interface RowOutcome {
  fresh: FreshRow[];
  /** Every row that moves the balance, in the order of the file. */
  flows: BalanceFlow[];
  movements: SavingsMovement[];
  savingsRows: Map<number, FingerprintedRow>;
  issues: ImportIssue[];
}

function planRow(
  db: AppDatabase,
  request: ImportRequest,
  index: number,
  row: FingerprintedRow,
  rules: readonly CategorizationRule[],
  outcome: RowOutcome,
): void {
  const given = request.rows[index]?.details;
  const details: RowDetails | undefined =
    given === undefined
      ? undefined
      : {
          ...given,
          savingsAccountId: given.savingsAccountId ?? request.savingsAccountId ?? null,
        };
  const problem = details === undefined ? null : checkRowDetails(details, row.amount);
  if (problem !== null) {
    outcome.issues.push({ kind: "rowProblem", index, problem });
    return;
  }

  const kind = details?.type ?? (row.amount > 0 ? "income" : "expense");
  if (kind === "savings") {
    const savingsAccountId = details?.savingsAccountId ?? null;
    if (savingsAccountId === null) {
      throw new Error("A savings row without a savings account passed the check");
    }
    outcome.movements.push({ index, date: row.date, amount: row.amount, savingsAccountId });
    outcome.flows.push({
      date: row.date,
      amount: row.amount,
      label: row.label,
      kind: "transfer",
    });
    outcome.savingsRows.set(index, row);
    return;
  }
  try {
    const categoryId = categoryOf(db, request.accountId, row, kind, details, rules);
    const input = toTransactionInput(request.accountId, row, categoryId, kind, details);
    outcome.fresh.push({
      input,
      fingerprint: row.fingerprint,
      contentKey: row.contentKey,
    });
    outcome.flows.push(input);
  } catch (error) {
    // Rows without details keep failing loudly: only the review gives a row to fix.
    if (details === undefined || !(error instanceof TransactionValidationError)) {
      throw error;
    }
    outcome.issues.push({ kind: "rowInvalid", index, ref: error.ref });
  }
}

// One row can split into several pairs that fail alike: it is reported once.
function buildSavingsPairs(
  accountId: number,
  transfers: readonly SavingsTransfer[],
  accounts: readonly OverflowAccount[],
  savingsRows: ReadonlyMap<number, FingerprintedRow>,
): { pairs: FreshTransfer[]; issues: ImportIssue[] } {
  const endpointOf = (id: number) => {
    const found = accounts.find((account) => account.id === id);
    if (found === undefined) throw new Error(`Unknown account ${id}`);
    return found;
  };
  const pairs: FreshTransfer[] = [];
  const issues: ImportIssue[] = [];

  for (const transfer of transfers) {
    const row = savingsRows.get(transfer.index);
    if (row === undefined) throw new Error(`Unknown savings row ${transfer.index}`);
    const parts =
      transfer.kind === "deposit"
        ? transfer.placements.map((placement) => ({
            source: accountId,
            destination: placement.accountId,
            amount: placement.amount,
          }))
        : [{ source: transfer.accountId, destination: accountId, amount: transfer.amount }];
    try {
      const rowPairs = parts.map((part): FreshTransfer => ({
        legs: buildTransferLegs({
          source: endpointOf(part.source),
          destination: endpointOf(part.destination),
          amount: part.amount,
          date: row.date,
          label: row.label,
        }),
        keys: null,
        keyedLeg: transfer.kind === "deposit" ? 0 : 1,
      }));
      const [first] = rowPairs;
      if (first !== undefined) {
        first.keys = { fingerprint: row.fingerprint, contentKey: row.contentKey };
      }
      pairs.push(...rowPairs);
    } catch (error) {
      if (!(error instanceof TransactionValidationError)) throw error;
      issues.push({ kind: "rowInvalid", index: transfer.index, ref: error.ref });
    }
  }
  return { pairs, issues };
}

function planImport(db: AppDatabase, request: ImportRequest): ImportPlan {
  const account = getAccount(db, request.accountId);
  const flagged = fingerprintWithDuplicateFlags(db, request);
  const rules = listApplicableRules(db);
  const outcome: RowOutcome = {
    fresh: [],
    flows: [],
    movements: [],
    savingsRows: new Map(),
    issues: [],
  };
  let newCount = 0;
  flagged.forEach(({ row, isDuplicate }, index) => {
    if (isDuplicate) return;
    newCount += 1;
    planRow(db, request, index, row, rules, outcome);
  });

  let transfers: SavingsTransfer[] = [];
  let pairs: FreshTransfer[] = [];
  const issues = [...outcome.issues];
  if (outcome.movements.length > 0) {
    const accounts = listOverflowAccounts(db);
    const plan = planSavingsTransfers(outcome.movements, accounts);
    const built = buildSavingsPairs(account.id, plan.transfers, accounts, outcome.savingsRows);
    transfers = plan.transfers;
    pairs = built.pairs;
    issues.push(...plan.issues, ...built.issues);
  }

  return {
    fresh: outcome.fresh,
    pairs,
    preview: {
      newCount,
      duplicateCount: flagged.length - newCount,
      ceilingWarnings: findCeilingExcesses(
        outcome.flows,
        getAccountBalance(db, account.id),
        account.depositCeiling,
      ),
      accountArchived: account.archived,
      transfers,
      transferCount: pairs.length,
      issues,
    },
  };
}

/** What an import would do, without writing anything. */
export function previewImport(
  db: AppDatabase,
  request: ImportRequest,
): ImportPreview {
  return planImport(db, request).preview;
}

function legColumns(
  pair: FreshTransfer,
  batchId: number,
): [LegImportColumns, LegImportColumns] {
  const columns: [LegImportColumns, LegImportColumns] = [
    { importBatchId: batchId },
    { importBatchId: batchId },
  ];
  if (pair.keys !== null) {
    columns[pair.keyedLeg] = {
      importBatchId: batchId,
      importFingerprint: pair.keys.fingerprint,
      importContentKey: pair.keys.contentKey,
    };
  }
  return columns;
}

/**
 * Records the rows that are not already known as transactions, under one
 * batch, all or nothing: a savings row is recorded as linked pairs of
 * transfers, and any issue (a part that fits nowhere, a loop in the chain, a
 * row the ledger refuses) blocks the whole file. A row matching a
 * categorization rule is categorized, the others wait in the to-categorize
 * queue. An archived account and a ceiling exceeded do not refuse the import
 * (DOMAIN, imports are the exception).
 */
export function commitImport(
  db: AppDatabase,
  request: CommitImportRequest,
): ImportResult {
  const { fresh, pairs, preview } = planImport(db, request);
  if (preview.issues.length > 0) throw new ImportBlockedError(preview.issues);
  if (preview.newCount === 0) return { ...preview, batchId: null };

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
            .map(({ input, fingerprint, contentKey }) => ({
              ...input,
              importBatchId: batch.id,
              importFingerprint: fingerprint,
              importContentKey: contentKey,
            })),
        )
        .run();
    }
    for (const pair of pairs) {
      insertTransferLegs(tx, pair.legs, legColumns(pair, batch.id));
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
