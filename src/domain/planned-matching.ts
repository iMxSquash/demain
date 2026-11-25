// Matching of real transactions to planned occurrences (DOMAIN, "Planned vs actual"). Pure: the
// data is an argument, nothing reads a clock or a store. A pair is confirmed only when it is
// unambiguous; every other candidate is proposed to the owner, never applied silently.

import { addDays } from "./calendar-date";
import { compareDates } from "./import-savings";
import type { OccurrenceStatus } from "./occurrence-resolution";
import { isProvisionCandidate, type ProvisionCandidateTransaction, type ProvisionItem } from "./provision";
import type { DateRange } from "./recurrence";

const BASIS_POINTS_DENOMINATOR = 10000;
const MATCHABLE_STATUSES: readonly OccurrenceStatus[] = ["planned", "overdue"];
// A provision settles the transactions of its whole period, so its occurrence can lie a repetition
// away from them: 366 days at most (a yearly repetition across a leap year), plus the 2 days at
// most of a business-day shift (a Sunday moved back to the Friday), which makes 368; 370 keeps a
// margin.
const PROVISION_REACH_DAYS = 370;

export interface MatchTransaction extends ProvisionCandidateTransaction {
  id: number;
  amount: number;
}

/** A dated occurrence still waiting for a transaction, with the rules that select its candidates. */
export interface MatchOccurrence {
  plannedItemId: number;
  nominalDate: string;
  /** The adjusted or overridden date: the window is centered on it, not on the nominal date. */
  date: string;
  accountId: number;
  expectedAmount: number;
  status: OccurrenceStatus;
  windowDays: number;
  toleranceBasisPoints: number;
  /** A planned transfer is settled by transfer legs only, and nothing else settles it. */
  isTransfer: boolean;
}

/** An open provision occurrence: the caller leaves out the cancelled ones, no status is checked here. */
export type ProvisionOccurrence = ProvisionItem & {
  plannedItemId: number;
  nominalDate: string;
  period: DateRange;
};

export interface MatchPair {
  transactionId: number;
  plannedItemId: number;
  nominalDate: string;
}

export interface MatchDecisions {
  confirmed: MatchPair[];
  /** Groups of mutually ambiguous pairs, to be settled by the owner one group at a time. */
  proposed: MatchPair[][];
  unmatched: number[];
}

interface Candidate {
  pair: MatchPair;
  isProvision: boolean;
}

/**
 * The range of effective dates to resolve so that every occurrence that can settle a transaction
 * dated inside `transactionDates` is found: a regular occurrence lies within its matching window
 * of the transaction, a provision occurrence within its period.
 */
export function matchingRange(
  transactionDates: DateRange,
  item: { matchWindowDays: number; acceptsMultipleTransactions: boolean },
): DateRange {
  const reach = item.acceptsMultipleTransactions ? PROVISION_REACH_DAYS : item.matchWindowDays;
  return { from: addDays(transactionDates.from, -reach), to: addDays(transactionDates.to, reach) };
}

/**
 * Whether an actual amount is within a tolerance (in basis points) of the expected one. The
 * tolerance is relative to the actual amount and tested by multiplication to avoid a division.
 */
export function isWithinTolerance(expected: number, actual: number, basisPoints: number): boolean {
  if (Math.sign(expected) !== Math.sign(actual)) return false;
  return Math.abs(expected - actual) * BASIS_POINTS_DENOMINATOR <= basisPoints * Math.abs(actual);
}

export function comparePairs(a: MatchPair, b: MatchPair): number {
  if (a.transactionId !== b.transactionId) return a.transactionId - b.transactionId;
  if (a.plannedItemId !== b.plannedItemId) return a.plannedItemId - b.plannedItemId;
  return compareDates(a.nominalDate, b.nominalDate);
}

function occurrenceKey(pair: MatchPair): string {
  return `${pair.plannedItemId}|${pair.nominalDate}`;
}

function toPair(transaction: MatchTransaction, plannedItemId: number, nominalDate: string): MatchPair {
  return { transactionId: transaction.id, plannedItemId, nominalDate };
}

/**
 * The dates of the transactions that can settle an occurrence: its matching window around its
 * effective date, or the period of a provision.
 */
export function matchingWindow(occurrence: { date: string; period: DateRange | null }, windowDays: number): DateRange {
  if (occurrence.period !== null) return occurrence.period;
  return { from: addDays(occurrence.date, -windowDays), to: addDays(occurrence.date, windowDays) };
}

/**
 * What a transaction recorded or linked by hand would settle on an open occurrence: what a partial
 * provision still expects, else the expected amount. A provision with nothing linked resolves to
 * overdue with nothing remaining once its period is over, yet nothing settled it.
 */
export function amountToSettle(occurrence: {
  status: OccurrenceStatus;
  expectedAmount: number;
  remaining: number;
}): number {
  return occurrence.status === "partial" ? occurrence.remaining : occurrence.expectedAmount;
}

function isRegularCandidate(transaction: MatchTransaction, occurrence: MatchOccurrence): boolean {
  if ((transaction.kind === "transfer") !== occurrence.isTransfer) return false;
  if (!MATCHABLE_STATUSES.includes(occurrence.status)) return false;
  if (transaction.accountId !== occurrence.accountId) return false;
  const window = matchingWindow({ date: occurrence.date, period: null }, occurrence.windowDays);
  if (transaction.date < window.from || transaction.date > window.to) return false;
  return isWithinTolerance(occurrence.expectedAmount, transaction.amount, occurrence.toleranceBasisPoints);
}

function provisionCandidates(
  transactions: readonly MatchTransaction[],
  provisions: readonly ProvisionOccurrence[],
): Candidate[] {
  return transactions.flatMap((transaction) =>
    provisions
      .filter((provision) => isProvisionCandidate(transaction, provision, provision.period))
      .map((provision) => ({
        pair: toPair(transaction, provision.plannedItemId, provision.nominalDate),
        isProvision: true,
      })),
  );
}

function regularCandidates(
  transactions: readonly MatchTransaction[],
  occurrences: readonly MatchOccurrence[],
): Candidate[] {
  return transactions.flatMap((transaction) =>
    occurrences
      .filter((occurrence) => isRegularCandidate(transaction, occurrence))
      .map((occurrence) => ({
        pair: toPair(transaction, occurrence.plannedItemId, occurrence.nominalDate),
        isProvision: false,
      })),
  );
}

/** Every fill-up of a provision's period, one pair per provision it fits. */
export function provisionLinks(
  transactions: readonly MatchTransaction[],
  provisions: readonly ProvisionOccurrence[],
): MatchPair[] {
  return provisionCandidates(transactions, provisions)
    .map((candidate) => candidate.pair)
    .sort(comparePairs);
}

function createUnionFind(): { find: (key: string) => string; union: (a: string, b: string) => void } {
  const parents = new Map<string, string>();
  const find = (key: string): string => {
    const parent = parents.get(key);
    if (parent === undefined || parent === key) return key;
    const root = find(parent);
    parents.set(key, root);
    return root;
  };
  const union = (a: string, b: string): void => {
    parents.set(find(a), find(b));
  };
  return { find, union };
}

// Provision candidates never join groups: a provision accepts any number of transactions, so
// sharing one says nothing about ambiguity between them.
function groupAmbiguous(candidates: readonly Candidate[]): MatchPair[][] {
  const { find, union } = createUnionFind();
  for (const { pair, isProvision } of candidates) {
    if (!isProvision) union(`t${pair.transactionId}`, `o${occurrenceKey(pair)}`);
  }
  const groups = new Map<string, MatchPair[]>();
  for (const { pair } of candidates) {
    const root = find(`t${pair.transactionId}`);
    const group = groups.get(root);
    if (group) group.push(pair);
    else groups.set(root, [pair]);
  }
  return [...groups.values()];
}

/**
 * Splits the transactions into confirmed pairs (a single candidate, itself not contested by
 * another transaction when it is a regular occurrence), proposed groups (everything ambiguous) and
 * unmatched transactions. The result does not depend on the order of the inputs.
 */
export function decideMatches(
  transactions: readonly MatchTransaction[],
  occurrences: readonly MatchOccurrence[],
  provisions: readonly ProvisionOccurrence[] = [],
): MatchDecisions {
  const candidates = [
    ...regularCandidates(transactions, occurrences),
    ...provisionCandidates(transactions, provisions),
  ].sort((a, b) => comparePairs(a.pair, b.pair));
  const perTransaction = Map.groupBy(candidates, (candidate) => candidate.pair.transactionId);
  const regularPerOccurrence = Map.groupBy(
    candidates.filter((candidate) => !candidate.isProvision),
    (candidate) => occurrenceKey(candidate.pair),
  );

  const isConfirmed = ({ pair, isProvision }: Candidate): boolean =>
    perTransaction.get(pair.transactionId)?.length === 1 &&
    (isProvision || regularPerOccurrence.get(occurrenceKey(pair))?.length === 1);

  const confirmed: MatchPair[] = [];
  const ambiguous: Candidate[] = [];
  for (const candidate of candidates) {
    if (isConfirmed(candidate)) confirmed.push(candidate.pair);
    else ambiguous.push(candidate);
  }

  const unmatched = transactions
    .filter((transaction) => !perTransaction.has(transaction.id))
    .map((transaction) => transaction.id)
    .sort((a, b) => a - b);

  return { confirmed, proposed: groupAmbiguous(ambiguous), unmatched };
}

/**
 * A transaction entered by hand (no import batch) that settles a regular occurrence, with the
 * window and tolerance of its planned item: a bank row may turn out to be the same movement.
 */
export type EnteredPayment = MatchTransaction &
  Pick<MatchOccurrence, "plannedItemId" | "nominalDate" | "windowDays" | "toleranceBasisPoints">;

/** The entries a row of a file under review may replace. */
export interface EnteredPaymentMatch<T extends EnteredPayment> {
  /** The id of the row, as given: its position in the file. */
  rowId: number;
  /** In date order, then by id. */
  candidates: T[];
  /** The entry replaced unless the owner says otherwise; null when the owner must choose. */
  proposed: T | null;
}

// Centered on the entry rather than on its occurrence: the entry already says when and how much
// was paid, and the bank row is the same movement.
function isEnteredCandidate(row: MatchTransaction, entry: EnteredPayment): boolean {
  if (row.kind === "transfer" || entry.kind === "transfer") return false;
  if (row.accountId !== entry.accountId) return false;
  const window = matchingWindow({ date: entry.date, period: null }, entry.windowDays);
  if (row.date < window.from || row.date > window.to) return false;
  return isWithinTolerance(entry.amount, row.amount, entry.toleranceBasisPoints);
}

/**
 * For each row of a file under review, the entries it may replace (DOMAIN, "Importing files").
 * An entry is proposed for replacement only when it is the sole candidate of a row that is its
 * sole row; anything else is left to the owner. Rows without a candidate are left out.
 */
export function findEnteredPayments<T extends EnteredPayment>(
  rows: readonly MatchTransaction[],
  entered: readonly T[],
): EnteredPaymentMatch<T>[] {
  const byDate = [...entered].sort((a, b) => compareDates(a.date, b.date) || a.id - b.id);
  const matches = [...rows]
    .sort((a, b) => a.id - b.id)
    .map((row) => ({ rowId: row.id, candidates: byDate.filter((entry) => isEnteredCandidate(row, entry)) }))
    .filter(({ candidates }) => candidates.length > 0);
  const rowsPerEntry = Map.groupBy(
    matches.flatMap(({ candidates }) => candidates),
    (entry) => entry.id,
  );
  return matches.map(({ rowId, candidates }) => {
    const [only] = candidates;
    const isSole = candidates.length === 1 && rowsPerEntry.get(only!.id)?.length === 1;
    return { rowId, candidates, proposed: isSole ? only! : null };
  });
}

/** How far ahead the "To pay" page looks after the due occurrences (owner, 25 Nov 2026). */
export const DUE_SOON_DAYS = 7;

const OPEN_STATUSES: readonly OccurrenceStatus[] = ["planned", "partial", "overdue"];

/** What the due lists need to know of an occurrence. */
export interface DueCandidate {
  plannedItemId: number;
  nominalDate: string;
  /** The effective date, after overrides and the business-day rule. */
  date: string;
  status: OccurrenceStatus;
}

export interface DueOccurrences<T> {
  /** Open occurrences whose effective date is today or earlier, oldest first. */
  due: T[];
  /** Open occurrences of the next `soonDays` days after today, in date order. */
  soon: T[];
}

function compareDue(a: DueCandidate, b: DueCandidate): number {
  return compareDates(a.date, b.date) || a.plannedItemId - b.plannedItemId || compareDates(a.nominalDate, b.nominalDate);
}

/**
 * The occurrences still waiting for a transaction (planned, partial or overdue), split into those
 * that are due and those due within `soonDays` days. Confirmed and cancelled ones are never due.
 */
export function dueOccurrences<T extends DueCandidate>(
  occurrences: readonly T[],
  today: string,
  soonDays: number,
): DueOccurrences<T> {
  const lastSoonDate = addDays(today, soonDays);
  const open = occurrences.filter((occurrence) => OPEN_STATUSES.includes(occurrence.status)).sort(compareDue);
  return {
    due: open.filter((occurrence) => occurrence.date <= today),
    soon: open.filter((occurrence) => occurrence.date > today && occurrence.date <= lastSoonDate),
  };
}
