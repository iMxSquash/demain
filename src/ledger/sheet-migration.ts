/**
 * One-time migration of the spreadsheet history into the ledger. The accounts
 * exist already; the migration sets their opening balances and records the
 * rows of the monthly tabs. See DOMAIN, section Migration from the sheet.
 */

import { eq, inArray } from "drizzle-orm";

import {
  BalanceAssertionValidationError,
  validateBalanceAssertionInput,
} from "../domain/balance-assertion";
import {
  CategoryValidationError,
  validateCategoryName,
} from "../domain/category";
import { validateRuleValue } from "../domain/categorization-rule";
import type { MessageRef } from "../domain/message";
import {
  splitSavingsRows,
  type SavingsIssue,
  type SavingsRow,
  type SavingsSplit,
  type SheetRow,
} from "../domain/sheet-import";
import type { SummaryMonth } from "../domain/sheet-summary";
import {
  computeMigratedMonths,
  verifyAgainstSummary,
  type SummaryVerification,
} from "../domain/sheet-verification";
import {
  buildTransferLegs,
  TransactionValidationError,
  validateTransactionInput,
} from "../domain/transaction";
import type { AppDatabase } from "../storage/database";
import {
  accounts,
  balanceAssertions,
  categories,
  transactions,
} from "../storage/schema";
import { listAccounts, listOverflowAccounts } from "./accounts";
import { insertRule, listRules } from "./categorization-rules";
import { insertTransferLegs } from "./transactions";

export interface SheetMigrationRequest {
  rows: readonly SheetRow[];
  checkingId: number;
  /** First account of the overflow chain that receives the savings. */
  savingsDestinationId: number;
  /** Calendar date, YYYY-MM-DD: the day before the first row. */
  openingDate: string;
  openingBalances: readonly { accountId: number; amount: number }[];
  /** Summary months within the scope of the import: the caller leaves the others out. */
  summary: readonly SummaryMonth[];
}

/** Where a row comes from: the line alone is not enough with several files. */
export interface RowLocation {
  source: string;
  line: number;
}

/** What stops the migration: the user fixes it, then runs the preview again. */
export type MigrationIssue =
  | SavingsIssue
  | { kind: "accountArchived"; accountId: number }
  /** The migration is one-time: a second run would double the history. */
  | { kind: "ledgerNotEmpty"; accountId: number }
  | { kind: "categoryArchived"; name: string; rows: RowLocation[] }
  | {
      kind: "rowInvalid";
      source: string;
      line: number;
      field: string;
      ref: MessageRef;
    }
  | { kind: "assertionInvalid"; month: string; field: string; ref: MessageRef };

/** Worth knowing, but it does not stop the migration. */
export type MigrationNotice =
  /** A Summary month without a real account balance: no assertion for it. */
  | { kind: "assertionSkipped"; month: string }
  /** One label carries several categories in the sheet: no rule can tell which. */
  | { kind: "ruleConflict"; label: string; categories: string[] }
  | { kind: "ruleExists"; label: string }
  /** Nothing was compared: the migration has no Summary to check itself against. */
  | { kind: "summaryNotProvided" };

export interface PlannedRule {
  /** Compared with the whole label, case-insensitively (operator equals). */
  value: string;
  categoryName: string;
}

export interface PlannedAssertion {
  accountId: number;
  /** Calendar date, YYYY-MM-DD: the last day of the month. */
  date: string;
  amount: number;
}

export interface SheetMigrationPreview {
  splits: SavingsSplit[];
  /** Names found in the rows that no category carries yet, in order of appearance. */
  categoriesToCreate: string[];
  assertionsToCreate: PlannedAssertion[];
  rulesToCreate: PlannedRule[];
  /** Null when no Summary was given. A difference is for the user to explain, not a block. */
  verification: SummaryVerification | null;
  issues: MigrationIssue[];
  notices: MigrationNotice[];
}

export interface SheetMigrationResult {
  transactionCount: number;
}

export class SheetMigrationBlockedError extends Error {
  constructor(readonly issues: readonly MigrationIssue[]) {
    super(`The migration is blocked by ${issues.length} issue(s)`);
    this.name = "SheetMigrationBlockedError";
  }
}

type Reader = Pick<AppDatabase, "select">;
type Writer = Pick<AppDatabase, "select" | "insert" | "update">;

function categoryIdsByName(reader: Reader): Map<string, number> {
  const known = new Map<string, number>();
  for (const category of reader.select().from(categories).all()) {
    known.set(category.name.toLowerCase(), category.id);
  }
  return known;
}

// A blank or invalid name is reported with its row, not thrown from here.
function categoryNameOf(row: SheetRow): string | null {
  if (row.type === "savings" || row.category === null) return null;
  try {
    return validateCategoryName(row.category);
  } catch (error) {
    if (error instanceof CategoryValidationError) return null;
    throw error;
  }
}

function findCategoriesToCreate(
  rows: readonly SheetRow[],
  known: ReadonlyMap<string, number>,
): string[] {
  const toCreate = new Map<string, string>();
  for (const row of rows) {
    const name = categoryNameOf(row);
    if (name === null) continue;
    const key = name.toLowerCase();
    if (!known.has(key) && !toCreate.has(key)) toCreate.set(key, name);
  }
  return [...toCreate.values()];
}

function findArchivedCategories(
  db: Reader,
  rows: readonly SheetRow[],
): MigrationIssue[] {
  const archived = new Set(
    db
      .select()
      .from(categories)
      .all()
      .filter((category) => category.archived)
      .map((category) => category.name.toLowerCase()),
  );
  const rowsByName = new Map<string, { name: string; rows: RowLocation[] }>();
  for (const row of rows) {
    const name = categoryNameOf(row);
    if (name === null || !archived.has(name.toLowerCase())) continue;
    const location = { source: row.source, line: row.line };
    const found = rowsByName.get(name.toLowerCase());
    if (found === undefined) {
      rowsByName.set(name.toLowerCase(), { name, rows: [location] });
    } else {
      found.rows.push(location);
    }
  }
  return [...rowsByName.values()].map((entry) => ({
    kind: "categoryArchived",
    ...entry,
  }));
}

function toRowInvalid(row: RowLocation, error: unknown): MigrationIssue {
  if (
    error instanceof TransactionValidationError ||
    error instanceof CategoryValidationError
  ) {
    return {
      kind: "rowInvalid",
      source: row.source,
      line: row.line,
      field: error.field,
      ref: error.ref,
    };
  }
  throw error;
}

// The checks that the recording will make, run ahead of it on every row.
function findInvalidMovements(
  rows: readonly SheetRow[],
  checkingId: number,
): MigrationIssue[] {
  const issues: MigrationIssue[] = [];
  for (const row of rows) {
    const kind = movementKindOf(row);
    if (kind === null) continue;
    try {
      if (row.category !== null) validateCategoryName(row.category);
      validateTransactionInput(toTransactionInput(row, kind, checkingId, null));
    } catch (error) {
      issues.push(toRowInvalid(row, error));
    }
  }
  return issues;
}

/** The kind of a recorded movement; null for savings, which become transfers. */
function movementKindOf(row: SheetRow): "expense" | "income" | null {
  return row.type === "savings" ? null : row.type;
}

function signedAmountOf(row: SheetRow, kind: "expense" | "income"): number {
  return kind === "expense" ? -row.amount : row.amount;
}

function toTransactionInput(
  row: SheetRow,
  kind: "expense" | "income",
  checkingId: number,
  categoryId: number | null,
) {
  return {
    accountId: checkingId,
    date: row.date,
    amount: signedAmountOf(row, kind),
    kind,
    label: row.label,
    paymentMode: row.paymentMode,
    categoryId,
  };
}

function findLedgerNotEmpty(
  db: AppDatabase,
  accountIds: readonly number[],
): MigrationIssue[] {
  return db
    .selectDistinct({ accountId: transactions.accountId })
    .from(transactions)
    .where(inArray(transactions.accountId, [...accountIds]))
    .orderBy(transactions.accountId)
    .all()
    .map(({ accountId }) => ({ kind: "ledgerNotEmpty", accountId }));
}

function openingBalanceMap(request: SheetMigrationRequest): Map<number, number> {
  return new Map(
    request.openingBalances.map(({ accountId, amount }) => [accountId, amount]),
  );
}

// The chain is walked with the opening balances the migration is about to set.
function accountsForRouting(db: AppDatabase, request: SheetMigrationRequest) {
  const openingBalance = openingBalanceMap(request);
  return listOverflowAccounts(db).map((account) => ({
    ...account,
    balance: openingBalance.get(account.id) ?? account.balance,
  }));
}

type RoutingAccounts = ReturnType<typeof accountsForRouting>;

// One rule per distinct (label, category) pair; a label with several categories gets none.
function planRules(
  db: Reader,
  rows: readonly SheetRow[],
): { rules: PlannedRule[]; notices: MigrationNotice[] } {
  const byLabel = new Map<string, { label: string; categories: Map<string, string> }>();
  for (const row of rows) {
    const category = categoryNameOf(row);
    const label = row.label.trim();
    if (category === null || label === "") continue;
    const entry = byLabel.get(label.toLowerCase()) ?? {
      label,
      categories: new Map<string, string>(),
    };
    if (!entry.categories.has(category.toLowerCase())) {
      entry.categories.set(category.toLowerCase(), category);
    }
    byLabel.set(label.toLowerCase(), entry);
  }

  const existing = new Set(
    listRules(db)
      .filter((rule) => rule.operator === "equals" && rule.accountId === null)
      .map((rule) => rule.value.trim().toLowerCase()),
  );
  const rules: PlannedRule[] = [];
  const notices: MigrationNotice[] = [];
  for (const [key, { label, categories: names }] of byLabel) {
    const categories = [...names.values()];
    if (categories.length > 1) {
      notices.push({ kind: "ruleConflict", label, categories });
    } else if (existing.has(key)) {
      notices.push({ kind: "ruleExists", label });
    } else {
      rules.push({ value: label, categoryName: categories[0] ?? "" });
    }
  }
  return { rules, notices };
}

// The accounts that hold the savings: the chain from the first destination.
function savingsChainIds(
  routing: RoutingAccounts,
  firstId: number,
): number[] {
  const ids: number[] = [];
  let current = routing.find((account) => account.id === firstId);
  while (current !== undefined && !ids.includes(current.id)) {
    ids.push(current.id);
    const nextId: number | null = current.overflowAccountId;
    current = routing.find((account) => account.id === nextId);
  }
  return ids;
}

function verifyAgainstSheet(
  db: AppDatabase,
  request: SheetMigrationRequest,
  splits: readonly SavingsSplit[],
  routing: RoutingAccounts,
): SummaryVerification | null {
  if (request.summary.length === 0) return null;

  const savingsAccountIds = savingsChainIds(routing, request.savingsDestinationId);
  const involved = new Set([request.checkingId, ...savingsAccountIds]);
  const openingBalance = openingBalanceMap(request);
  const accounts = listAccounts(db, { includeArchived: true }).filter(
    (account) => involved.has(account.id),
  );
  const referenceCurrency = accounts.find((a) => a.id === request.checkingId)?.currency;
  if (referenceCurrency === undefined) {
    throw new Error(`Unknown account ${request.checkingId}`);
  }

  const computed = computeMigratedMonths({
    checkingId: request.checkingId,
    savingsAccountIds,
    referenceCurrency,
    accounts: accounts.map((account) => ({
      id: account.id,
      kind: account.kind,
      currency: account.currency,
      openingDate: request.openingDate,
      openingBalance: openingBalance.get(account.id) ?? account.openingBalance,
    })),
    movements: request.rows.flatMap((row) => {
      const kind = movementKindOf(row);
      return kind === null
        ? []
        : [{ date: row.date, amount: signedAmountOf(row, kind), kind }];
    }),
    splits,
  });
  return verifyAgainstSummary(computed, request.summary);
}

function lastDayOf(month: string): string {
  const [year = 0, number = 1] = month.split("-").map(Number);
  // Day 0 of the next month is the last day of this one.
  return new Date(Date.UTC(year, number, 0)).toISOString().slice(0, 10);
}

// The real account balance of each month becomes an assertion on the checking account.
function planAssertions(request: SheetMigrationRequest): {
  assertions: PlannedAssertion[];
  issues: MigrationIssue[];
  notices: MigrationNotice[];
} {
  const plan = {
    assertions: [] as PlannedAssertion[],
    issues: [] as MigrationIssue[],
    notices: [] as MigrationNotice[],
  };
  for (const { month, realAccountBalance } of request.summary) {
    if (realAccountBalance === null) {
      plan.notices.push({ kind: "assertionSkipped", month });
      continue;
    }
    const assertion = {
      accountId: request.checkingId,
      date: lastDayOf(month),
      amount: realAccountBalance,
    };
    try {
      // The account takes its new opening date with the migration.
      validateBalanceAssertionInput(assertion, {
        openingDate: request.openingDate,
      });
      plan.assertions.push(assertion);
    } catch (error) {
      if (!(error instanceof BalanceAssertionValidationError)) throw error;
      plan.issues.push({
        kind: "assertionInvalid",
        month,
        field: error.field,
        ref: error.ref,
      });
    }
  }
  return plan;
}

function findArchivedChecking(
  routing: RoutingAccounts,
  checkingId: number,
): MigrationIssue[] {
  return routing
    .filter((account) => account.id === checkingId && account.archived)
    .map((account) => ({ kind: "accountArchived", accountId: account.id }));
}

// The checks that the recording will make, run ahead of it on every row.
function findInvalidRows(
  request: SheetMigrationRequest,
  routing: RoutingAccounts,
  splits: readonly SavingsSplit[],
): MigrationIssue[] {
  const invalid = findInvalidMovements(request.rows, request.checkingId);
  for (const { row, placements } of splits) {
    for (const placement of placements) {
      try {
        buildTransferLegs(transferOf(routing, request.checkingId, placement, row));
      } catch (error) {
        invalid.push(toRowInvalid(row, error));
      }
    }
  }
  return orderedWithoutDuplicates(invalid, request.rows);
}

/** The preview, and the accounts it was computed on, which the recording reuses. */
interface MigrationPlan {
  preview: SheetMigrationPreview;
  routing: RoutingAccounts;
}

function planMigration(
  db: AppDatabase,
  request: SheetMigrationRequest,
): MigrationPlan {
  const routing = accountsForRouting(db, request);
  const { splits, issues: savingsIssues } = splitSavingsRows(
    request.rows.filter((row) => row.type === "savings"),
    request.savingsDestinationId,
    routing,
  );
  const assertionPlan = planAssertions(request);
  const rulePlan = planRules(db, request.rows);
  const summaryNotices: MigrationNotice[] =
    request.summary.length === 0 ? [{ kind: "summaryNotProvided" }] : [];

  return {
    routing,
    preview: {
      splits,
      categoriesToCreate: findCategoriesToCreate(
        request.rows,
        categoryIdsByName(db),
      ),
      assertionsToCreate: assertionPlan.assertions,
      rulesToCreate: rulePlan.rules,
      verification: verifyAgainstSheet(db, request, splits, routing),
      notices: [
        ...summaryNotices,
        ...assertionPlan.notices,
        ...rulePlan.notices,
      ],
      issues: [
        ...findArchivedChecking(routing, request.checkingId),
        ...findLedgerNotEmpty(db, [
          request.checkingId,
          ...request.openingBalances.map((opening) => opening.accountId),
        ]),
        ...findInvalidRows(request, routing, splits),
        ...findArchivedCategories(db, request.rows),
        ...savingsIssues,
        ...assertionPlan.issues,
      ],
    },
  };
}

/** What the migration would do and what stops it, without writing anything. */
export function previewSheetMigration(
  db: AppDatabase,
  request: SheetMigrationRequest,
): SheetMigrationPreview {
  return planMigration(db, request).preview;
}

// One savings row can split into several transfers that fail alike. The rows
// come back in the order of the files, then of the lines.
function orderedWithoutDuplicates(
  issues: readonly MigrationIssue[],
  rows: readonly SheetRow[],
): MigrationIssue[] {
  const sourceRank = new Map<string, number>();
  for (const row of rows) {
    if (!sourceRank.has(row.source)) sourceRank.set(row.source, sourceRank.size);
  }
  const rankOf = (source: string) => sourceRank.get(source) ?? 0;

  const seen = new Set<string>();
  return issues
    .filter((issue) => {
      if (issue.kind !== "rowInvalid") return true;
      const key = `${issue.source}|${issue.line}|${issue.field}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) =>
      a.kind === "rowInvalid" && b.kind === "rowInvalid"
        ? rankOf(a.source) - rankOf(b.source) || a.line - b.line
        : 0,
    );
}

function transferOf(
  routing: RoutingAccounts,
  checkingId: number,
  placement: { accountId: number; amount: number },
  row: SavingsRow,
) {
  const endpointOf = (id: number) => {
    const account = routing.find((a) => a.id === id);
    if (account === undefined) throw new Error(`Unknown account ${id}`);
    return { id, currency: account.currency, archived: account.archived };
  };
  return {
    source: endpointOf(checkingId),
    destination: endpointOf(placement.accountId),
    amount: placement.amount,
    date: row.date,
    label: row.label,
  };
}

function recordRows(
  tx: Writer,
  request: SheetMigrationRequest,
  categoryIds: Map<string, number>,
): number {
  let count = 0;
  for (const row of request.rows) {
    const kind = movementKindOf(row);
    if (kind === null) continue;

    let categoryId: number | null = null;
    if (row.category !== null) {
      const name = validateCategoryName(row.category);
      categoryId =
        categoryIds.get(name.toLowerCase()) ??
        tx.insert(categories).values({ name }).returning().get().id;
      categoryIds.set(name.toLowerCase(), categoryId);
    }
    tx.insert(transactions)
      .values(
        validateTransactionInput(
          toTransactionInput(row, kind, request.checkingId, categoryId),
        ),
      )
      .run();
    count += 1;
  }
  return count;
}

/**
 * Records the whole history, or nothing: it runs in one transaction, and it
 * is refused when the preview reports an issue.
 */
export function commitSheetMigration(
  db: AppDatabase,
  request: SheetMigrationRequest,
): SheetMigrationResult {
  const { preview, routing } = planMigration(db, request);
  if (preview.issues.length > 0) {
    throw new SheetMigrationBlockedError(preview.issues);
  }

  return db.transaction((tx) => {
    for (const { accountId, amount } of request.openingBalances) {
      tx.update(accounts)
        .set({ openingBalance: amount, openingDate: request.openingDate })
        .where(eq(accounts.id, accountId))
        .run();
    }

    let transactionCount = recordRows(tx, request, categoryIdsByName(tx));
    for (const { row, placements } of preview.splits) {
      for (const placement of placements) {
        insertTransferLegs(
          tx,
          buildTransferLegs(
            transferOf(routing, request.checkingId, placement, row),
          ),
        );
        transactionCount += 2;
      }
    }
    const categoryIds = categoryIdsByName(tx);
    for (const rule of preview.rulesToCreate) {
      const categoryId = categoryIds.get(rule.categoryName.toLowerCase());
      if (categoryId === undefined) {
        throw new Error(`Category "${rule.categoryName}" was not recorded`);
      }
      insertRule(tx, {
        operator: "equals",
        value: validateRuleValue(rule.value),
        accountId: null,
        categoryId,
      });
    }
    for (const assertion of preview.assertionsToCreate) {
      tx.insert(balanceAssertions)
        .values(
          validateBalanceAssertionInput(assertion, {
            openingDate: request.openingDate,
          }),
        )
        .run();
    }
    return { transactionCount };
  });
}
