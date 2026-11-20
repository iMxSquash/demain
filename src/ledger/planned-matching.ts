import { and, eq, inArray, isNotNull, ne } from "drizzle-orm";

import { messageRef, type MessageRef } from "../domain/message";
import { resolveOccurrences, type OccurrenceLink } from "../domain/occurrence-resolution";
import {
  decideMatches,
  matchingRange,
  type MatchOccurrence,
  type MatchPair,
  type ProvisionOccurrence,
} from "../domain/planned-matching";
import type { DateRange } from "../domain/recurrence";
import type { AppDatabase } from "../storage/database";
import { plannedItems, transactions } from "../storage/schema";
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

function writeLink(
  db: Pick<AppDatabase, "update">,
  transaction: Transaction,
  item: Pick<PlannedItemRow, "id" | "categoryId">,
  nominalDate: string,
): void {
  const inheritsCategory = item.categoryId !== null && transaction.categoryId === null;
  db.update(transactions)
    .set({
      plannedItemId: item.id,
      occurrenceDate: nominalDate,
      ...(inheritsCategory ? { categoryId: item.categoryId, categoryFromPlannedItem: true } : {}),
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
  if (batchTransactions.length === 0) return NO_MATCHES;

  const accountIds = new Set(batchTransactions.map((transaction) => transaction.accountId));
  const items = listPlannedItems(db, {
    includeCancelled: false,
    accountIds: [...accountIds],
  });
  if (items.length === 0) return NO_MATCHES;

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

  // The decisions only name rows of this batch and of `items`, so both lookups succeed.
  const transactionsById = new Map(
    batchTransactions.map((transaction) => [transaction.id, transaction]),
  );
  const itemsById = new Map(items.map((item) => [item.id, item]));
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
