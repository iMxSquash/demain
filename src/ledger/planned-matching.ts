import { and, eq, inArray, isNotNull, isNull, ne } from "drizzle-orm";

import { compareDates } from "../domain/import-savings";
import { messageRef, type MessageRef } from "../domain/message";
import { resolveOccurrences, type OccurrenceLink } from "../domain/occurrence-resolution";
import {
  comparePairs,
  decideMatches,
  matchingRange,
  type MatchDecisions,
  type MatchOccurrence,
  type MatchPair,
  type ProvisionOccurrence,
} from "../domain/planned-matching";
import type { DateRange } from "../domain/recurrence";
import type { AppDatabase } from "../storage/database";
import { plannedItems, transactions } from "../storage/schema";
import { getImportBatch } from "./import-batch-lookup";
import { listPlannedItems, toPlannedSchedule, type PlannedItemWithDetails } from "./planned-items";
import type { Transaction } from "./transactions";

type Executor = Pick<AppDatabase, "select" | "update">;

type PlannedItemRow = typeof plannedItems.$inferSelect;

/** A link the ledger refuses. Users read the translation of `ref`. */
export class PlannedLinkError extends Error {
  constructor(
    message: string,
    readonly ref: MessageRef,
  ) {
    super(message);
    this.name = "PlannedLinkError";
  }
}

export interface ImportMatchRequest {
  batchId: number;
  /** YYYY-MM-DD: decides which occurrences are overdue, never read from a clock here. */
  today: string;
}

export interface ImportMatchOutcome {
  /** Transactions linked to an occurrence by the import. */
  matchedCount: number;
  /** Groups of ambiguous pairs left to the owner: nothing is written for them. */
  proposedCount: number;
}

/** The outcome when nothing is matched, including by an import that writes nothing. */
export const NO_MATCHES: ImportMatchOutcome = {
  matchedCount: 0,
  proposedCount: 0,
};

/** A transaction without category takes the one of the item it is linked to. */
function inheritsCategory(
  item: Pick<PlannedItemRow, "categoryId">,
  transaction: Pick<Transaction, "categoryId">,
): boolean {
  return item.categoryId !== null && transaction.categoryId === null;
}

function writeLink(
  db: Pick<AppDatabase, "update">,
  transaction: Transaction,
  item: Pick<PlannedItemRow, "id" | "categoryId">,
  nominalDate: string,
): void {
  db.update(transactions)
    .set({
      plannedItemId: item.id,
      occurrenceDate: nominalDate,
      ...(inheritsCategory(item, transaction)
        ? { categoryId: item.categoryId, categoryFromPlannedItem: true } : {}),
    })
    .where(eq(transactions.id, transaction.id))
    .run();
}

function isOccurrenceTaken(db: Pick<AppDatabase, "select">, pair: MatchPair): boolean {
  const other = db
    .select({ id: transactions.id })
    .from(transactions)
    .where(
      and(
        eq(transactions.plannedItemId, pair.plannedItemId),
        eq(transactions.occurrenceDate, pair.nominalDate),
      ),
    )
    .get();
  return other !== undefined;
}

/**
 * Links a transaction to the occurrence of a planned item (DOMAIN, invariant 5). The transaction
 * must exist, not be a transfer, not be linked yet and be on the account of the item; a regular
 * occurrence takes one transaction, a provision any number. A transaction without category takes
 * the category of the item, and remembers it came from there.
 */
export function linkTransactionToOccurrence(db: Executor, pair: MatchPair): void {
  const transaction = db
    .select()
    .from(transactions)
    .where(eq(transactions.id, pair.transactionId))
    .get();
  if (transaction === undefined) {
    throw new PlannedLinkError(
      `Transaction ${pair.transactionId} does not exist`,
      messageRef("matchTransactionUnknown"),
    );
  }
  if (transaction.kind === "transfer") {
    throw new PlannedLinkError(
      "A transfer cannot be linked to a planned item",
      messageRef("matchTransactionIsTransfer"),
    );
  }
  if (transaction.plannedItemId !== null) {
    throw new PlannedLinkError(
      "The transaction is already linked to a planned item",
      messageRef("matchTransactionAlreadyLinked"),
    );
  }
  const item = db.select().from(plannedItems).where(eq(plannedItems.id, pair.plannedItemId)).get();
  if (item === undefined) {
    throw new PlannedLinkError(
      `Planned item ${pair.plannedItemId} does not exist`,
      messageRef("plannedItemGone"),
    );
  }
  if (item.accountId !== transaction.accountId) {
    throw new PlannedLinkError(
      "The transaction and the planned item are on different accounts",
      messageRef("matchOtherAccount"),
    );
  }
  if (!item.acceptsMultipleTransactions && isOccurrenceTaken(db, pair)) {
    throw new PlannedLinkError(
      "Another transaction already settles this occurrence",
      messageRef("matchOccurrenceTaken"),
    );
  }
  writeLink(db, transaction, item, pair.nominalDate);
}

/** Clears the link. A category the link gave goes with it; one chosen by hand stays. */
export function unlinkTransaction(db: Executor, transactionId: number): void {
  const transaction = db
    .select()
    .from(transactions)
    .where(eq(transactions.id, transactionId))
    .get();
  if (transaction === undefined) {
    throw new PlannedLinkError(
      `Transaction ${transactionId} does not exist`,
      messageRef("matchTransactionUnknown"),
    );
  }
  db.update(transactions)
    .set({
      plannedItemId: null,
      occurrenceDate: null,
      ...(transaction.categoryFromPlannedItem
        ? { categoryId: null, categoryFromPlannedItem: false }
        : {}),
    })
    .where(eq(transactions.id, transactionId))
    .run();
}

function dateRangeOf(rows: readonly Transaction[]): DateRange {
  const dates = rows.map((row) => row.date).sort();
  return { from: dates[0]!, to: dates[dates.length - 1]! };
}

function linksOf(
  db: Pick<AppDatabase, "select">,
  itemIds: number[],
): Map<number, OccurrenceLink[]> {
  const rows = db
    .select({
      transactionId: transactions.id,
      plannedItemId: transactions.plannedItemId,
      occurrenceDate: transactions.occurrenceDate,
      date: transactions.date,
      amount: transactions.amount,
    })
    .from(transactions)
    .where(
      and(inArray(transactions.plannedItemId, itemIds), isNotNull(transactions.occurrenceDate)),
    )
    .all();
  // The where clause keeps linked transactions only, so the nullable columns are set.
  const links = rows.map(({ occurrenceDate, ...link }) => ({
    ...link,
    occurrenceDate: occurrenceDate!,
  }));
  const byItem = Map.groupBy(links, (link) => link.plannedItemId!);
  return byItem;
}

interface OpenOccurrences {
  regular: MatchOccurrence[];
  provisions: ProvisionOccurrence[];
}

function openOccurrencesOf(
  item: PlannedItemWithDetails,
  links: readonly OccurrenceLink[],
  transactionDates: DateRange,
  today: string,
): OpenOccurrences {
  const resolved = resolveOccurrences(
    {
      schedule: toPlannedSchedule(item),
      overrides: item.overrides,
      matchWindowDays: item.matchWindowDays,
      acceptsMultipleTransactions: item.acceptsMultipleTransactions,
    },
    links,
    matchingRange(transactionDates, item),
    today,
  );
  const open: OpenOccurrences = { regular: [], provisions: [] };
  for (const occurrence of resolved) {
    if (occurrence.status === "cancelled") continue;
    if (occurrence.period !== null) {
      open.provisions.push({
        plannedItemId: item.id,
        nominalDate: occurrence.nominalDate,
        period: occurrence.period,
        accountId: item.accountId,
        categoryId: item.categoryId,
        provisionLabelFilter: item.provisionLabelFilter,
      });
      continue;
    }
    open.regular.push({
      plannedItemId: item.id,
      nominalDate: occurrence.nominalDate,
      date: occurrence.date,
      accountId: item.accountId,
      expectedAmount: occurrence.expectedAmount,
      status: occurrence.status,
      windowDays: item.matchWindowDays,
      toleranceBasisPoints: item.matchAmountToleranceBp,
    });
  }
  return open;
}

interface BatchDecisions {
  decisions: MatchDecisions;
  transactionsById: Map<number, Transaction>;
  itemsById: Map<number, PlannedItemWithDetails>;
}

/** Runs the matching on `batchTransactions`, which must be non-transfer rows; null when no item can match. */
function decideBatchMatches(
  db: Pick<AppDatabase, "select">,
  batchTransactions: readonly Transaction[],
  today: string,
): BatchDecisions | null {
  if (batchTransactions.length === 0) return null;

  const accountIds = new Set(batchTransactions.map((transaction) => transaction.accountId));
  const items = listPlannedItems(db, {
    includeCancelled: false,
    accountIds: [...accountIds],
  });
  if (items.length === 0) return null;

  const links = linksOf(
    db,
    items.map((item) => item.id),
  );
  const transactionDates = dateRangeOf(batchTransactions);
  const open = items.map((item) =>
    openOccurrencesOf(item, links.get(item.id) ?? [], transactionDates, today),
  );
  const decisions = decideMatches(
    batchTransactions,
    open.flatMap(({ regular }) => regular),
    open.flatMap(({ provisions }) => provisions),
  );
  // The decisions only name rows of `batchTransactions` and of `items`, so both lookups succeed.
  return {
    decisions,
    transactionsById: new Map(
      batchTransactions.map((transaction) => [transaction.id, transaction]),
    ),
    itemsById: new Map(items.map((item) => [item.id, item])),
  };
}

/**
 * Links the transactions of an imported batch to the occurrences they settle (DOMAIN, "Matching
 * planned vs actual"). Only unambiguous pairs are written, fill-ups of a provision included; the
 * ambiguous ones are counted and left alone. Run it in the transaction that records the batch.
 */
export function applyImportMatches(
  db: Executor,
  { batchId, today }: ImportMatchRequest,
): ImportMatchOutcome {
  const batchTransactions = db
    .select()
    .from(transactions)
    .where(and(eq(transactions.importBatchId, batchId), ne(transactions.kind, "transfer")))
    .all();
  const result = decideBatchMatches(db, batchTransactions, today);
  if (result === null) return NO_MATCHES;

  const { decisions, transactionsById, itemsById } = result;
  for (const pair of decisions.confirmed) {
    writeLink(
      db,
      transactionsById.get(pair.transactionId)!,
      itemsById.get(pair.plannedItemId)!,
      pair.nominalDate,
    );
  }
  return {
    matchedCount: decisions.confirmed.length,
    proposedCount: decisions.proposed.length,
  };
}

/** A transaction of a batch already linked to an occurrence. */
export interface BatchMatchedItem {
  transactionId: number;
  label: string;
  date: string;
  /** Integer minor units. */
  amount: number;
  plannedItemName: string;
  nominalDate: string;
}

/** One way to settle an ambiguous transaction, with what the owner needs to choose. */
export interface ProposedMatchOption {
  pair: MatchPair;
  transactionLabel: string;
  transactionDate: string;
  transactionAmount: number;
  plannedItemName: string;
  nominalDate: string;
  /** True when confirming gives the transaction the category of the item (it has none now). */
  givesCategory: boolean;
}

/** Options that compete for the same transactions or occurrences: at most one can be confirmed. */
export interface ProposedMatchGroup {
  options: ProposedMatchOption[];
}

export interface BatchMatches {
  matched: BatchMatchedItem[];
  groups: ProposedMatchGroup[];
}

function unlinkedBatchTransactions(
  db: Pick<AppDatabase, "select">,
  batchId: number,
): Transaction[] {
  return db
    .select()
    .from(transactions)
    .where(
      and(
        eq(transactions.importBatchId, batchId),
        ne(transactions.kind, "transfer"),
        isNull(transactions.plannedItemId),
      ),
    )
    .all();
}

/**
 * The proposals of a batch, computed on its transactions still unlinked. A pair the matching would
 * confirm on its own is a proposal too: it only reaches this list once an automatic match was undone.
 */
function proposedGroupsOf(
  db: Pick<AppDatabase, "select">,
  batchId: number,
  today: string,
): {
  groups: MatchPair[][];
  transactionsById: Map<number, Transaction>;
  itemsById: Map<number, PlannedItemWithDetails>;
} {
  const result = decideBatchMatches(db, unlinkedBatchTransactions(db, batchId), today);
  if (result === null) return { groups: [], transactionsById: new Map(), itemsById: new Map() };
  const { decisions, transactionsById, itemsById } = result;
  const groups = [...decisions.confirmed.map((pair) => [pair]), ...decisions.proposed];
  return { groups, transactionsById, itemsById };
}

/**
 * What the matching did and still proposes for a batch: the linked transactions, and the groups of
 * pairs left to the owner. Nothing is stored: proposals are recomputed on each call.
 */
export function listBatchMatches(
  db: Pick<AppDatabase, "select">,
  batchId: number,
  today: string,
): BatchMatches {
  getImportBatch(db, batchId);

  const linkedRows = db
    .select({
      transactionId: transactions.id,
      label: transactions.label,
      date: transactions.date,
      amount: transactions.amount,
      plannedItemName: plannedItems.name,
      nominalDate: transactions.occurrenceDate,
    })
    .from(transactions)
    .innerJoin(plannedItems, eq(plannedItems.id, transactions.plannedItemId))
    .where(
      and(
        eq(transactions.importBatchId, batchId),
        isNotNull(transactions.plannedItemId),
        isNotNull(transactions.occurrenceDate),
      ),
    )
    .all();
  // The where clause keeps linked transactions only, so the nullable columns are set.
  const matched = linkedRows
    .map(({ nominalDate, ...row }) => ({ ...row, nominalDate: nominalDate! }))
    .sort((a, b) => compareDates(a.date, b.date) || a.transactionId - b.transactionId);

  const { groups, transactionsById, itemsById } = proposedGroupsOf(db, batchId, today);
  const described = groups.map((pairs) => ({
    options: pairs.map((pair): ProposedMatchOption => {
      const transaction = transactionsById.get(pair.transactionId)!;
      const item = itemsById.get(pair.plannedItemId)!;
      return {
        pair,
        transactionLabel: transaction.label,
        transactionDate: transaction.date,
        transactionAmount: transaction.amount,
        plannedItemName: item.name,
        nominalDate: pair.nominalDate,
        givesCategory: inheritsCategory(item, transaction),
      };
    }),
  }));
  // A group is never empty: it is ordered by its first option.
  described.sort((a, b) => {
    const [first, second] = [a.options[0]!, b.options[0]!];
    return (
      compareDates(first.transactionDate, second.transactionDate) ||
      first.pair.transactionId - second.pair.transactionId
    );
  });
  return { matched, groups: described };
}

/** Links a pair that the batch currently proposes; a pair that is not (any more) is refused. */
export function confirmMatch(
  db: AppDatabase,
  batchId: number,
  pair: MatchPair,
  today: string,
): void {
  db.transaction((tx) => {
    getImportBatch(tx, batchId);
    const { groups } = proposedGroupsOf(tx, batchId, today);
    if (!groups.some((group) => group.some((proposed) => comparePairs(proposed, pair) === 0))) {
      throw new PlannedLinkError(
        "The pair is not proposed for this import batch",
        messageRef("matchNotProposed"),
      );
    }
    linkTransactionToOccurrence(tx, pair);
  });
}

/** Unlinks a transaction of the batch that is linked to an occurrence. */
export function undoMatch(db: AppDatabase, batchId: number, transactionId: number): void {
  getImportBatch(db, batchId);
  db.transaction((tx) => {
    const transaction = tx
      .select()
      .from(transactions)
      .where(and(eq(transactions.id, transactionId), eq(transactions.importBatchId, batchId)))
      .get();
    if (transaction === undefined || transaction.plannedItemId === null) {
      throw new PlannedLinkError(
        `Transaction ${transactionId} is not a linked transaction of batch ${batchId}`,
        messageRef("matchNotInBatch"),
      );
    }
    unlinkTransaction(tx, transactionId);
  });
}
