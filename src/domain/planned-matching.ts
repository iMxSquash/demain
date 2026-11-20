// Matching of real transactions to planned occurrences (DOMAIN, "Planned vs actual"). Pure: the
// data is an argument, nothing reads a clock or a store. A pair is confirmed only when it is
// unambiguous; every other candidate is proposed to the owner, never applied silently.

import { addDays } from "./calendar-date";
import type { OccurrenceStatus } from "./occurrence-resolution";
import { isProvisionCandidate, type ProvisionCandidateTransaction, type ProvisionItem } from "./provision";
import type { DateRange } from "./recurrence";

const BASIS_POINTS_DENOMINATOR = 10000;
const MATCHABLE_STATUSES: readonly OccurrenceStatus[] = ["planned", "overdue"];

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
}

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
 * Whether an actual amount is within a tolerance (in basis points) of the expected one. The
 * tolerance is relative to the actual amount and tested by multiplication to avoid a division.
 */
export function isWithinTolerance(expected: number, actual: number, basisPoints: number): boolean {
  if (expected === 0 || actual === 0) return expected === actual;
  if (Math.sign(expected) !== Math.sign(actual)) return false;
  return Math.abs(expected - actual) * BASIS_POINTS_DENOMINATOR <= basisPoints * Math.abs(actual);
}

function comparePairs(a: MatchPair, b: MatchPair): number {
  if (a.transactionId !== b.transactionId) return a.transactionId - b.transactionId;
  if (a.plannedItemId !== b.plannedItemId) return a.plannedItemId - b.plannedItemId;
  if (a.nominalDate === b.nominalDate) return 0;
  return a.nominalDate < b.nominalDate ? -1 : 1;
}

function occurrenceKey(pair: MatchPair): string {
  return `${pair.plannedItemId}|${pair.nominalDate}`;
}

function toPair(transaction: MatchTransaction, plannedItemId: number, nominalDate: string): MatchPair {
  return { transactionId: transaction.id, plannedItemId, nominalDate };
}

function isRegularCandidate(transaction: MatchTransaction, occurrence: MatchOccurrence): boolean {
  if (!MATCHABLE_STATUSES.includes(occurrence.status)) return false;
  if (transaction.accountId !== occurrence.accountId) return false;
  if (transaction.date < addDays(occurrence.date, -occurrence.windowDays)) return false;
  if (transaction.date > addDays(occurrence.date, occurrence.windowDays)) return false;
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
  return transactions
    .filter((transaction) => transaction.kind !== "transfer")
    .flatMap((transaction) =>
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

function countBy<T>(items: readonly T[], keyOf: (item: T) => string | number): Map<string | number, number> {
  const counts = new Map<string | number, number>();
  for (const item of items) counts.set(keyOf(item), (counts.get(keyOf(item)) ?? 0) + 1);
  return counts;
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
    groups.set(root, [...(groups.get(root) ?? []), pair]);
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
  const candidates = [...regularCandidates(transactions, occurrences), ...provisionCandidates(transactions, provisions)].sort(
    (a, b) => comparePairs(a.pair, b.pair),
  );
  const perTransaction = countBy(candidates, (candidate) => candidate.pair.transactionId);
  const regularPerOccurrence = countBy(
    candidates.filter((candidate) => !candidate.isProvision),
    (candidate) => occurrenceKey(candidate.pair),
  );

  const isConfirmed = ({ pair, isProvision }: Candidate): boolean =>
    perTransaction.get(pair.transactionId) === 1 && (isProvision || regularPerOccurrence.get(occurrenceKey(pair)) === 1);

  const unmatched = transactions
    .filter((transaction) => transaction.kind !== "transfer" && !perTransaction.has(transaction.id))
    .map((transaction) => transaction.id)
    .sort((a, b) => a - b);

  return {
    confirmed: candidates.filter(isConfirmed).map((candidate) => candidate.pair),
    proposed: groupAmbiguous(candidates.filter((candidate) => !isConfirmed(candidate))),
    unmatched,
  };
}
