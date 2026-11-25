import { and, asc, between, desc, eq, gt, inArray, isNotNull, isNull, lt, ne } from "drizzle-orm";

import { addDays, daysBetween } from "../domain/calendar-date";
import { labelContains } from "../domain/categorization-rule";
import { compareDates } from "../domain/import-savings";
import { messageRef, type MessageRef } from "../domain/message";
import {
  resolveOccurrences,
  type OccurrenceLink,
  type OccurrenceStatus,
} from "../domain/occurrence-resolution";
import type { PlannedItemKind } from "../domain/planned-item";
import {
  amountToSettle,
  comparePairs,
  decideMatches,
  DUE_SOON_DAYS,
  dueOccurrences,
  matchingRange,
  matchingWindow,
  type DueOccurrences,
  type MatchDecisions,
  type MatchOccurrence,
  type MatchPair,
  type ProvisionOccurrence,
} from "../domain/planned-matching";
import type { DateRange } from "../domain/recurrence";
import type { AppDatabase } from "../storage/database";
import { accounts, plannedItems, transactions } from "../storage/schema";
import { getDefaultPaymentMode } from "./default-payment-mode";
import { getImportBatch } from "./import-batch-lookup";
import {
  listPlannedItems,
  PlannedItemNotFoundError,
  getPlannedItem,
  toPlannedSchedule,
  type PlannedItemWithDetails,
} from "./planned-items";
import {
  createTransaction,
  getOpenAccount,
  recordManualTransfer,
  type SurplusDecision,
  type Transaction,
} from "./transactions";

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
  /** Transactions linked to an occurrence by the import; a transfer row counts once. */
  matchedCount: number;
  /** Groups of ambiguous pairs left to the owner: nothing is written for them. */
  proposedCount: number;
}

/** The outcome when nothing is matched, including by an import that writes nothing. */
export const NO_MATCHES: ImportMatchOutcome = {
  matchedCount: 0,
  proposedCount: 0,
};

/**
 * A transaction without category takes the one of the item it is linked to. A transfer leg only
 * matches a planned transfer, which the domain keeps without category.
 */
function inheritsCategory(
  item: Pick<PlannedItemRow, "categoryId">,
  transaction: Pick<Transaction, "categoryId">,
): boolean {
  return item.categoryId !== null && transaction.categoryId === null;
}

/**
 * Links `transactionIds` to an occurrence: by default the transaction itself, or every outgoing leg
 * of a transfer row whose representative is `transaction`.
 */
function writeLink(
  db: Pick<AppDatabase, "update">,
  transaction: Transaction,
  item: Pick<PlannedItemRow, "id" | "categoryId">,
  nominalDate: string,
  inheritCategory = true,
  transactionIds: readonly number[] = [transaction.id],
): void {
  db.update(transactions)
    .set({
      plannedItemId: item.id,
      occurrenceDate: nominalDate,
      ...(inheritCategory && inheritsCategory(item, transaction)
        ? { categoryId: item.categoryId, categoryFromPlannedItem: true }
        : {}),
    })
    .where(inArray(transactions.id, [...transactionIds]))
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

function assertNotTransfer(transaction: Pick<Transaction, "kind">): void {
  if (transaction.kind !== "transfer") return;
  throw new PlannedLinkError(
    "A transfer cannot be linked to a planned item",
    messageRef("matchTransactionIsTransfer"),
  );
}

function assertNotLinked(transaction: Pick<Transaction, "plannedItemId">): void {
  if (transaction.plannedItemId === null) return;
  throw new PlannedLinkError(
    "The transaction is already linked to a planned item",
    messageRef("matchTransactionAlreadyLinked"),
  );
}

function readTransactionOrThrow(db: Pick<AppDatabase, "select">, id: number): Transaction {
  const transaction = db.select().from(transactions).where(eq(transactions.id, id)).get();
  if (transaction === undefined) {
    throw new PlannedLinkError(
      `Transaction ${id} does not exist`,
      messageRef("matchTransactionUnknown"),
    );
  }
  return transaction;
}

/**
 * Links a transaction to the occurrence of a planned item (DOMAIN, invariant 5). The transaction
 * must exist, not be a transfer, not be linked yet and be on the account of the item; a regular
 * occurrence takes one transaction, a provision any number. A transaction without category takes
 * the category of the item, and remembers it came from there, unless `inheritCategory` is false
 * (a link made by hand leaves the category alone).
 */
export function linkTransactionToOccurrence(
  db: Executor,
  pair: MatchPair,
  { inheritCategory = true }: { inheritCategory?: boolean } = {},
): void {
  const transaction = readTransactionOrThrow(db, pair.transactionId);
  assertNotTransfer(transaction);
  assertNotLinked(transaction);
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
  writeLink(db, transaction, item, pair.nominalDate, inheritCategory);
}

/** Clears the link. A category the link gave goes with it; one chosen by hand stays. */
export function unlinkTransaction(db: Executor, transactionId: number): void {
  const transaction = readTransactionOrThrow(db, transactionId);
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
      isTransfer: item.kind === "transfer",
    });
  }
  return open;
}

/**
 * One imported savings row as a single matchable transaction: the lowest id of its outgoing legs,
 * with the sum of their amounts, since a planned transfer is compared with the whole row whatever
 * its split along the overflow chain (owner). The legs of a row are linked and unlinked together.
 */
interface TransferRow {
  representative: Transaction;
  /** Every outgoing leg of the row, in id order: all of them carry the link. */
  legIds: number[];
}

function startsNewRow(current: TransferRow, leg: Transaction, counterpart?: Transaction): boolean {
  if (
    leg.importFingerprint !== null ||
    (counterpart !== undefined && counterpart.importFingerprint !== null)
  ) {
    return true;
  }
  const { date, label, accountId } = current.representative;
  return leg.date !== date || leg.label !== label || leg.accountId !== accountId;
}

/**
 * Groups the transfer legs of a batch back into the rows they came from. No column names the row:
 * the import keys mark the first pair of each row, and a change of date, label or account guards
 * against a keyed pair deleted by hand. The pairs of a row are inserted consecutively.
 */
function transferRowsOf(db: Pick<AppDatabase, "select">, batchId: number): TransferRow[] {
  const legs = db
    .select()
    .from(transactions)
    .where(and(eq(transactions.importBatchId, batchId), eq(transactions.kind, "transfer")))
    .orderBy(asc(transactions.id))
    .all();
  const legsById = new Map(legs.map((leg) => [leg.id, leg]));
  const rows: TransferRow[] = [];
  for (const leg of legs) {
    if (leg.amount >= 0) continue;
    const counterpart =
      leg.transferCounterpartId === null ? undefined : legsById.get(leg.transferCounterpartId);
    const current = rows.at(-1);
    if (current === undefined || startsNewRow(current, leg, counterpart)) {
      // A copy, so that summing the row leaves the selected leg as read.
      rows.push({ representative: { ...leg }, legIds: [leg.id] });
      continue;
    }
    current.representative.amount += leg.amount;
    current.legIds.push(leg.id);
  }
  return rows;
}

/** What the matching of a batch looks at: its non-transfer transactions and its transfer rows. */
interface BatchCandidates {
  transactions: Transaction[];
  /** Every outgoing leg of a transfer row, under its representative; any other candidate is alone. */
  legIdsOf: ReadonlyMap<number, readonly number[]>;
}

function batchCandidatesOf(
  db: Pick<AppDatabase, "select">,
  batchId: number,
  rows: readonly TransferRow[],
  { unlinkedOnly }: { unlinkedOnly: boolean },
): BatchCandidates {
  const nonTransfers = db
    .select()
    .from(transactions)
    .where(
      and(
        eq(transactions.importBatchId, batchId),
        ne(transactions.kind, "transfer"),
        unlinkedOnly ? isNull(transactions.plannedItemId) : undefined,
      ),
    )
    .all();
  const candidateRows = rows.filter(
    ({ representative }) => !unlinkedOnly || representative.plannedItemId === null,
  );
  return {
    transactions: [...nonTransfers, ...candidateRows.map((row) => row.representative)],
    legIdsOf: new Map(candidateRows.map(({ representative, legIds }) => [representative.id, legIds])),
  };
}

/** What a pair decided on a batch needs to be described or written. */
interface BatchLookups {
  transactionsById: ReadonlyMap<number, Transaction>;
  itemsById: ReadonlyMap<number, PlannedItemWithDetails>;
  legIdsOf: ReadonlyMap<number, readonly number[]>;
}

/** The lookups of a batch where nothing can match: no decision ever reads them. */
const NO_LOOKUPS: BatchLookups = {
  transactionsById: new Map(),
  itemsById: new Map(),
  legIdsOf: new Map(),
};

interface BatchDecisions extends BatchLookups {
  decisions: MatchDecisions;
}

/**
 * Runs the matching on the candidates of a batch, where a transfer stands for a whole imported
 * row; null when no item can match.
 */
function decideBatchMatches(
  db: Pick<AppDatabase, "select">,
  { transactions: batchTransactions, legIdsOf }: BatchCandidates,
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
    legIdsOf,
  };
}

/** Writes a pair the matching of a batch named, on every transaction its candidate stands for. */
function writeDecidedLink(
  db: Pick<AppDatabase, "update">,
  { transactionsById, itemsById, legIdsOf }: BatchLookups,
  pair: MatchPair,
): void {
  // The decisions only name candidates of the batch and its items, so the lookups succeed.
  writeLink(
    db,
    transactionsById.get(pair.transactionId)!,
    itemsById.get(pair.plannedItemId)!,
    pair.nominalDate,
    true,
    legIdsOf.get(pair.transactionId),
  );
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
  const rows = transferRowsOf(db, batchId);
  const result = decideBatchMatches(
    db,
    batchCandidatesOf(db, batchId, rows, { unlinkedOnly: false }),
    today,
  );
  if (result === null) return NO_MATCHES;

  for (const pair of result.decisions.confirmed) writeDecidedLink(db, result, pair);
  return {
    matchedCount: result.decisions.confirmed.length,
    proposedCount: result.decisions.proposed.length,
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

/**
 * The proposals of a batch, computed on its transactions still unlinked. A pair the matching
 * would confirm on its own is a proposal too: it only reaches this list once an automatic match
 * was undone.
 */
function proposedGroupsOf(
  db: Pick<AppDatabase, "select">,
  batchId: number,
  rows: readonly TransferRow[],
  today: string,
): BatchLookups & { groups: MatchPair[][] } {
  const result = decideBatchMatches(
    db,
    batchCandidatesOf(db, batchId, rows, { unlinkedOnly: true }),
    today,
  );
  if (result === null) return { groups: [], ...NO_LOOKUPS };
  const { decisions, ...lookups } = result;
  const groups = [...decisions.confirmed.map((pair) => [pair]), ...decisions.proposed];
  return { groups, ...lookups };
}

/**
 * The transactions of a batch already linked to an occurrence, oldest first; the legs of a transfer
 * row make one entry, under the id and with the amount of the row.
 */
function matchedRowsOf(
  db: Pick<AppDatabase, "select">,
  batchId: number,
  transferRows: readonly TransferRow[],
): BatchMatchedItem[] {
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
  // A row shows under its representative, the first of its legs, with the row sum.
  const rowSums = new Map(
    transferRows.map(({ representative }) => [representative.id, representative.amount]),
  );
  const otherLegs = new Set(transferRows.flatMap(({ legIds }) => legIds.slice(1)));
  // The where clause keeps linked transactions only, so the nullable columns are set.
  return linkedRows
    .filter(({ transactionId }) => !otherLegs.has(transactionId))
    .map(({ nominalDate, ...row }) => ({
      ...row,
      amount: rowSums.get(row.transactionId) ?? row.amount,
      nominalDate: nominalDate!,
    }))
    .sort((a, b) => compareDates(a.date, b.date) || a.transactionId - b.transactionId);
}

function describeOption(
  pair: MatchPair,
  transaction: Transaction,
  item: PlannedItemWithDetails,
): ProposedMatchOption {
  return {
    pair,
    transactionLabel: transaction.label,
    transactionDate: transaction.date,
    transactionAmount: transaction.amount,
    plannedItemName: item.name,
    nominalDate: pair.nominalDate,
    givesCategory: inheritsCategory(item, transaction),
  };
}

/** Groups ordered by their first option; a group is never empty. */
function compareGroups(a: ProposedMatchGroup, b: ProposedMatchGroup): number {
  const [first, second] = [a.options[0]!, b.options[0]!];
  return (
    compareDates(first.transactionDate, second.transactionDate) ||
    first.pair.transactionId - second.pair.transactionId
  );
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

  const rows = transferRowsOf(db, batchId);
  const { groups, transactionsById, itemsById } = proposedGroupsOf(db, batchId, rows, today);
  const described = groups.map((pairs) => ({
    options: pairs.map((pair) =>
      describeOption(
        pair,
        transactionsById.get(pair.transactionId)!,
        itemsById.get(pair.plannedItemId)!,
      ),
    ),
  }));
  return {
    matched: matchedRowsOf(db, batchId, rows),
    groups: described.sort(compareGroups),
  };
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
    const rows = transferRowsOf(tx, batchId);
    const { groups, ...lookups } = proposedGroupsOf(tx, batchId, rows, today);
    if (!groups.some((group) => group.some((proposed) => comparePairs(proposed, pair) === 0))) {
      throw new PlannedLinkError(
        "The pair is not proposed for this import batch",
        messageRef("matchNotProposed"),
      );
    }
    // A proposed transfer row is a whole imported row, which manual linking refuses: it is written
    // on all its outgoing legs. The pair is proposed, so the batch knows its transaction.
    if (lookups.transactionsById.get(pair.transactionId)!.kind === "transfer") {
      writeDecidedLink(tx, lookups, pair);
    } else {
      linkTransactionToOccurrence(tx, pair);
    }
  });
}

/**
 * Unlinks a transaction of the batch that is linked to an occurrence; an outgoing leg of a transfer
 * row unlinks the whole row.
 */
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
    if (transaction.kind !== "transfer") {
      unlinkTransaction(tx, transactionId);
      return;
    }
    // A transfer leg never takes a category from its item: clearing the link is all there is.
    const row = transferRowsOf(tx, batchId).find(({ legIds }) => legIds.includes(transactionId));
    tx.update(transactions)
      .set({ plannedItemId: null, occurrenceDate: null })
      .where(inArray(transactions.id, row?.legIds ?? [transactionId]))
      .run();
  });
}

/** An unsettled occurrence the owner can link a transaction to by hand. */
export interface LinkCandidate {
  pair: MatchPair;
  plannedItemName: string;
  nominalDate: string;
  /** The effective date of the occurrence, after overrides and the business-day rule. */
  date: string;
  /** Integer minor units: the expected amount, or what a provision still expects. */
  amount: number;
  status: OpenStatus;
}

type OpenStatus = Extract<OccurrenceStatus, "planned" | "overdue" | "partial">;

function isOpenStatus(status: OccurrenceStatus): status is OpenStatus {
  return status === "planned" || status === "overdue" || status === "partial";
}

// Only bounds the generation of open-ended recurrences: it is not a matching rule.
const LINK_CANDIDATE_HORIZON_DAYS = 366;

function candidatesOf(
  item: PlannedItemWithDetails,
  links: readonly OccurrenceLink[],
  transaction: Transaction,
  today: string,
): LinkCandidate[] {
  const lastDate = today > transaction.date ? today : transaction.date;
  const resolved = resolveOccurrences(
    {
      schedule: toPlannedSchedule(item),
      overrides: item.overrides,
      matchWindowDays: item.matchWindowDays,
      acceptsMultipleTransactions: item.acceptsMultipleTransactions,
    },
    links,
    {
      from: item.startDate,
      to: addDays(lastDate, LINK_CANDIDATE_HORIZON_DAYS),
    },
    today,
  );
  const candidates: LinkCandidate[] = [];
  for (const occurrence of resolved) {
    const { status } = occurrence;
    if (!isOpenStatus(status)) continue;
    const amount = amountToSettle(occurrence);
    if (amount === 0 || Math.sign(amount) !== Math.sign(transaction.amount)) continue;
    candidates.push({
      pair: {
        transactionId: transaction.id,
        plannedItemId: item.id,
        nominalDate: occurrence.nominalDate,
      },
      plannedItemName: item.name,
      nominalDate: occurrence.nominalDate,
      date: occurrence.date,
      amount,
      status,
    });
  }
  return candidates;
}

/**
 * The occurrences a transaction can be linked to by hand: unsettled ones of the planned items of
 * its account with the sign of its amount, the closest in time first. There is no window and no
 * tolerance, the owner decides. A transfer or an already linked transaction has none.
 */
export function listLinkCandidates(
  db: Pick<AppDatabase, "select">,
  transactionId: number,
  today: string,
): LinkCandidate[] {
  const transaction = readTransactionOrThrow(db, transactionId);
  if (transaction.kind === "transfer" || transaction.plannedItemId !== null) return [];

  const items = listPlannedItems(db, {
    includeCancelled: false,
    accountIds: [transaction.accountId],
  });
  if (items.length === 0) return [];
  const links = linksOf(
    db,
    items.map((item) => item.id),
  );
  return items
    .flatMap((item) => candidatesOf(item, links.get(item.id) ?? [], transaction, today))
    .map((candidate) => ({
      candidate,
      distance: Math.abs(daysBetween(transaction.date, candidate.date)),
    }))
    .sort(
      (a, b) =>
        a.distance - b.distance ||
        compareDates(a.candidate.date, b.candidate.date) ||
        a.candidate.pair.plannedItemId - b.candidate.pair.plannedItemId,
    )
    .map(({ candidate }) => candidate);
}

/**
 * Links a transaction to an occurrence chosen by hand. The pair must be one of the candidates of
 * the ledger, whatever the browser sent. A transfer is never linked and an archived account keeps
 * its history untouched. The category of the transaction is left alone.
 */
export function linkByHand(db: AppDatabase, pair: MatchPair, today: string): void {
  db.transaction((tx) => {
    const transaction = readTransactionOrThrow(tx, pair.transactionId);
    assertNotTransfer(transaction);
    assertNotLinked(transaction);
    getOpenAccount(tx, transaction.accountId);
    const isProposed = listLinkCandidates(tx, pair.transactionId, today).some(
      ({ pair: proposed }) => comparePairs(proposed, pair) === 0,
    );
    if (!isProposed) {
      throw new PlannedLinkError(
        "The occurrence is not a candidate for this transaction",
        messageRef("matchNotProposed"),
      );
    }
    linkTransactionToOccurrence(tx, pair, { inheritCategory: false });
  });
}

/**
 * Clears the link of a transaction by hand, unless its account is archived. A transfer leg is
 * refused: every outgoing leg of its imported row carries the link, so the row is unlinked as a
 * whole from the import review (`undoMatch`).
 */
export function unlinkByHand(db: AppDatabase, transactionId: number): void {
  db.transaction((tx) => {
    const transaction = readTransactionOrThrow(tx, transactionId);
    assertNotTransfer(transaction);
    getOpenAccount(tx, transaction.accountId);
    unlinkTransaction(tx, transactionId);
  });
}

/** An occurrence still waiting for a transaction, as the "To pay" and "Link a transaction" pages show it. */
export interface OpenOccurrence {
  plannedItemId: number;
  nominalDate: string;
  /** The effective date, after overrides and the business-day rule. */
  date: string;
  name: string;
  kind: PlannedItemKind;
  accountId: number;
  /** A planned transfer only. */
  destinationAccountId: number | null;
  /** The currency of the account of the item. */
  currency: string;
  status: OpenStatus;
  /** Signed minor units: the expected amount, or what a provision still expects. */
  amount: number;
  /** The dates of the transactions that settle it: its matching window, or its period. */
  window: DateRange;
}

// A business-day rule moves a date by two days at most.
const NOMINAL_SHIFT_DAYS = 2;

/** The effective dates an occurrence can have: around its nominal date, or where an override moved it. */
function rangeAround(item: PlannedItemWithDetails, nominalDate: string): DateRange {
  const moved = item.overrides.find((override) => override.nominalDate === nominalDate)?.overrideDate ?? null;
  const from = addDays(nominalDate, -NOMINAL_SHIFT_DAYS);
  const to = addDays(nominalDate, NOMINAL_SHIFT_DAYS);
  if (moved === null) return { from, to };
  return { from: moved < from ? moved : from, to: moved > to ? moved : to };
}

function resolveItem(
  item: PlannedItemWithDetails,
  links: readonly OccurrenceLink[],
  range: DateRange,
  today: string,
) {
  return resolveOccurrences(
    {
      schedule: toPlannedSchedule(item),
      overrides: item.overrides,
      matchWindowDays: item.matchWindowDays,
      acceptsMultipleTransactions: item.acceptsMultipleTransactions,
    },
    links,
    range,
    today,
  );
}

function toOpenOccurrence(
  item: PlannedItemWithDetails,
  occurrence: ReturnType<typeof resolveItem>[number] & { status: OpenStatus },
  currency: string,
): OpenOccurrence {
  return {
    plannedItemId: item.id,
    nominalDate: occurrence.nominalDate,
    date: occurrence.date,
    name: item.name,
    kind: item.kind,
    accountId: item.accountId,
    destinationAccountId: item.destinationAccountId,
    currency,
    status: occurrence.status,
    amount: amountToSettle(occurrence),
    window: matchingWindow(occurrence, item.matchWindowDays),
  };
}

function currencyOf(db: Pick<AppDatabase, "select">, accountId: number): string {
  return getOpenAccount(db, accountId).currency;
}

/** Names one occurrence of a planned item. */
export interface OccurrenceRef {
  plannedItemId: number;
  nominalDate: string;
}

function refuse(message: string, key: "markPaidOccurrenceUnknown" | "markPaidOccurrenceSettled" | "markPaidOccurrenceCancelled"): never {
  throw new PlannedLinkError(message, messageRef(key));
}

function readItemOrThrow(db: Pick<AppDatabase, "select">, plannedItemId: number): PlannedItemWithDetails {
  try {
    return getPlannedItem(db, plannedItemId);
  } catch (error) {
    if (!(error instanceof PlannedItemNotFoundError)) throw error;
    throw new PlannedLinkError(error.message, messageRef("plannedItemGone"));
  }
}

/**
 * The occurrence, if it still waits for a transaction; refused when it is unknown, settled or
 * cancelled (the whole item cancelled included), or when the account of its item is archived.
 */
function readOpenOccurrence(
  db: Pick<AppDatabase, "select">,
  { plannedItemId, nominalDate }: OccurrenceRef,
  today: string,
): { item: PlannedItemWithDetails; occurrence: OpenOccurrence } {
  const item = readItemOrThrow(db, plannedItemId);
  const links = linksOf(db, [item.id]).get(item.id) ?? [];
  const occurrence = resolveItem(item, links, rangeAround(item, nominalDate), today).find(
    (candidate) => candidate.nominalDate === nominalDate,
  );
  if (occurrence === undefined) refuse(`No occurrence of item ${item.id} on ${nominalDate}`, "markPaidOccurrenceUnknown");
  if (item.cancelled || occurrence.status === "cancelled") refuse("The occurrence is cancelled", "markPaidOccurrenceCancelled");
  if (occurrence.status === "confirmed") refuse("The occurrence is already settled", "markPaidOccurrenceSettled");
  const currency = currencyOf(db, item.accountId);
  // The narrowing of `status` is lost through the checks above.
  return { item, occurrence: toOpenOccurrence(item, { ...occurrence, status: occurrence.status as OpenStatus }, currency) };
}

export interface MarkPaidRequest extends OccurrenceRef {
  /** YYYY-MM-DD: the date of the transaction to record. */
  date: string;
  /** Positive integer in minor units: the kind of the item gives the sign. */
  amount: number;
}

export interface MarkPaidResult {
  /** For a planned transfer, the part of the surplus that stays in the source account. */
  unplaced: number;
}

function recordPlannedTransfer(
  db: AppDatabase,
  item: PlannedItemWithDetails,
  request: MarkPaidRequest,
  decision: SurplusDecision | null,
): MarkPaidResult {
  // The domain keeps a destination on every planned transfer.
  const { transfers, unplaced } = recordManualTransfer(
    db,
    {
      sourceId: item.accountId,
      destinationId: item.destinationAccountId!,
      amount: request.amount,
      date: request.date,
      label: item.name,
    },
    decision,
  );
  // Every outgoing leg settles the occurrence, as the import does for a split row (#175).
  const outgoing = transfers.map(([leg]) => leg);
  writeLink(db, outgoing[0]!, item, request.nominalDate, false, outgoing.map((leg) => leg.id));
  return { unplaced };
}

/**
 * Records the real transaction of an open occurrence and links it, in one database transaction
 * (DOMAIN, "Matching planned vs actual"). The transaction follows the rules of one entered by hand:
 * the account and the kind of the item, its name as the label, the default payment mode, and the
 * category of the item, inherited as by a match. A provision takes one more payment each time.
 * A planned transfer follows the manual transfer flow: `SurplusDecisionRequiredError` is thrown,
 * with nothing written, until `decision` says what to do with a surplus above the ceiling.
 * The planned item itself never changes (invariant 6).
 */
export function markOccurrencePaid(
  db: AppDatabase,
  request: MarkPaidRequest,
  today: string,
  decision: SurplusDecision | null = null,
): MarkPaidResult {
  return db.transaction(() => {
    const { item } = readOpenOccurrence(db, request, today);
    if (item.kind === "transfer") return recordPlannedTransfer(db, item, request, decision);
    const created = createTransaction(db, {
      accountId: item.accountId,
      date: request.date,
      amount: item.kind === "expense" ? -request.amount : request.amount,
      kind: item.kind,
      label: item.name,
      paymentMode: getDefaultPaymentMode(db),
    });
    linkTransactionToOccurrence(db, {
      transactionId: created.id,
      plannedItemId: item.id,
      nominalDate: request.nominalDate,
    });
    return { unplaced: 0 };
  });
}

/** The accounts that are archived: an item on one of them takes no entered transaction. */
function archivedAccountIds(db: Pick<AppDatabase, "select">): Set<number> {
  const rows = db.select({ id: accounts.id }).from(accounts).where(eq(accounts.archived, true)).all();
  return new Set(rows.map(({ id }) => id));
}

function currencies(db: Pick<AppDatabase, "select">): Map<number, string> {
  const rows = db.select({ id: accounts.id, currency: accounts.currency }).from(accounts).all();
  return new Map(rows.map(({ id, currency }) => [id, currency]));
}

/**
 * The occurrences of the "To pay" page: due ones (effective date today or earlier), then those of
 * the next `DUE_SOON_DAYS` days. Items of an archived account are left out, since nothing can be
 * entered there; so are cancelled items. The navigation counts `due`.
 */
export function listDueOccurrences(db: Pick<AppDatabase, "select">, today: string): DueOccurrences<OpenOccurrence> {
  const archived = archivedAccountIds(db);
  const items = listPlannedItems(db, { includeCancelled: false }).filter(
    (item) =>
      !archived.has(item.accountId) && (item.destinationAccountId === null || !archived.has(item.destinationAccountId)),
  );
  if (items.length === 0) return { due: [], soon: [] };
  const links = linksOf(
    db,
    items.map((item) => item.id),
  );
  const currencyById = currencies(db);
  const to = addDays(today, DUE_SOON_DAYS);
  const open = items.flatMap((item) => {
    // Every occurrence since the start can still be overdue; an override may move one earlier.
    const from = item.overrides.reduce(
      (earliest, { overrideDate }) => (overrideDate !== null && overrideDate < earliest ? overrideDate : earliest),
      addDays(item.startDate, -NOMINAL_SHIFT_DAYS),
    );
    return resolveItem(item, links.get(item.id) ?? [], { from, to }, today).flatMap((occurrence) => {
      const { status } = occurrence;
      return isOpenStatus(status)
        ? [toOpenOccurrence(item, { ...occurrence, status }, currencyById.get(item.accountId) ?? "")]
        : [];
    });
  });
  return dueOccurrences(open, today, DUE_SOON_DAYS);
}

export interface LinkFilters {
  /** Defaults to the window of the occurrence. */
  range?: DateRange;
  /** Part of the label, whatever its case. */
  search?: string;
}

export interface OccurrenceLinkCandidates {
  occurrence: OpenOccurrence;
  /** The dates listed: the filters, or the window of the occurrence. */
  range: DateRange;
  /** Newest first. */
  transactions: Transaction[];
}

/**
 * The transactions an open occurrence can be linked to by hand, the reverse of
 * `listLinkCandidates`: unlinked transactions of the account of the item, of the sign of what it
 * expects, never a transfer, in the range asked for. `linkByHand` checks the choice again.
 */
export function listOccurrenceLinkCandidates(
  db: Pick<AppDatabase, "select">,
  ref: OccurrenceRef,
  today: string,
  { range, search = "" }: LinkFilters = {},
): OccurrenceLinkCandidates {
  const { item, occurrence } = readOpenOccurrence(db, ref, today);
  assertNotTransfer(item);
  const listed = range ?? occurrence.window;
  const rows = db
    .select()
    .from(transactions)
    .where(
      and(
        eq(transactions.accountId, item.accountId),
        isNull(transactions.plannedItemId),
        ne(transactions.kind, "transfer"),
        occurrence.amount < 0 ? lt(transactions.amount, 0) : gt(transactions.amount, 0),
        between(transactions.date, listed.from, listed.to),
      ),
    )
    .orderBy(desc(transactions.date), desc(transactions.id))
    .all();
  const query = search.trim();
  return {
    occurrence,
    range: listed,
    transactions: query === "" ? rows : rows.filter((row) => labelContains(row.label, query)),
  };
}
