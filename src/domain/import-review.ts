/**
 * What the review of imported files shows besides the three texts of a row:
 * why a type needs to be checked. Pure functions: no database, no clock. See
 * DOMAIN, section Guessing the type of an imported row.
 */

import type { MovementType } from "./import-columns";
import {
  checkRowDetails,
  readImportDraft,
  type ImportDraft,
  type RowDetails,
  type RowProblem,
} from "./import-draft";
import type { TypeEvidence, TypeGuess } from "./import-guess";
import {
  planFilesInDateOrder,
  type SavingsMovement,
  type SavingsTransfer,
} from "./import-savings";
import type { OverflowAccount } from "./overflow";

/** The types a row can have, in the order the review offers them. */
export const MOVEMENT_TYPES = [
  "expense",
  "income",
  "savings",
] as const satisfies readonly MovementType[];

/** Why a guessed type is worth a look, in words the review can translate. */
export type ConfirmReason =
  | { kind: "typeCellConflict"; value: string }
  | { kind: "categoryWord"; category: string }
  | { kind: "categoryOverruled"; category: string }
  | { kind: "history"; type: MovementType }
  | { kind: "historyOverruled"; type: MovementType }
  | { kind: "sign"; type: MovementType }
  | { kind: "debitCredit"; type: MovementType }
  | { kind: "nothing" }
  | { kind: "typeCellUnknown"; value: string };

function reasonOfEvidence(
  guess: TypeGuess,
  evidence: TypeEvidence,
): ConfirmReason {
  const { conflict } = guess;
  switch (evidence.kind) {
    case "typeCell":
      return { kind: "typeCellConflict", value: evidence.value };
    case "categoryWord":
      return { kind: "categoryWord", category: evidence.category };
    case "history":
      return { kind: "history", type: evidence.type };
    case "sign":
    case "debitCredit":
      if (conflict?.kind === "categoryWord") {
        return { kind: "categoryOverruled", category: conflict.category };
      }
      if (conflict?.kind === "history") {
        return { kind: "historyOverruled", type: conflict.type };
      }
      return { kind: evidence.kind, type: guess.type };
    case "none":
      return { kind: "nothing" };
  }
}

/**
 * The reasons a row is marked "to confirm": only a low confidence guess is.
 * Empty for a row whose type could not be guessed (it has its own problem) and
 * for a guess that does not need a look.
 */
export function confirmReasons(guess: TypeGuess | null): ConfirmReason[] {
  if (guess === null || guess.confidence !== "low") return [];
  const reasons = [reasonOfEvidence(guess, guess.evidence)];
  if (guess.ignoredTypeCell !== null) {
    reasons.push({ kind: "typeCellUnknown", value: guess.ignoredTypeCell });
  }
  return reasons;
}

/** A part of what a savings row does, seen from the account that receives the file. */
export interface SplitSegment {
  /** "to" a savings account, "from" one, or "unplaced": the part that fits nowhere. */
  direction: "to" | "from" | "unplaced";
  /** Null for the part that fits nowhere. */
  accountId: number | null;
  /** Positive, in minor units. */
  amount: number;
}

/** The parts a planned savings row is split into, in the order they are recorded. */
export function splitSegments(transfer: SavingsTransfer): SplitSegment[] {
  if (transfer.kind === "withdrawal") {
    return [{ direction: "from", accountId: transfer.accountId, amount: transfer.amount }];
  }
  const segments = transfer.placements.map(
    ({ accountId, amount }): SplitSegment => ({ direction: "to", accountId, amount }),
  );
  if (transfer.unplaced > 0) {
    segments.push({ direction: "unplaced", accountId: null, amount: transfer.unplaced });
  }
  return segments;
}

/** Where a file of the import stands: "failed" is a file that could not be read. */
export type FilePhase = "reviewing" | "importing" | "done" | "cancelled" | "failed";

const SETTLED_PHASES: readonly FilePhase[] = ["done", "cancelled", "failed"];

/**
 * The first file before `index` that is still to be imported or cancelled, or
 * null when the file may be imported now. Files are recorded one after the
 * other because each is planned from the balances the previous one leaves.
 */
export function nextFileToSettle(
  phases: readonly FilePhase[],
  index: number,
): number | null {
  const found = phases.slice(0, index).findIndex((phase) => !SETTLED_PHASES.includes(phase));
  return found === -1 ? null : found;
}

/** What is wrong with a row as the user left it, or null; the server reads it again on import. */
export function reviewRowProblem(
  draft: ImportDraft,
  details: RowDetails,
  currency: string,
  defaultSavingsAccountId: number | null,
): RowProblem | null {
  const reading = readImportDraft(draft, currency);
  if (!reading.ok) return reading.problem;
  return checkRowDetails(
    { ...details, savingsAccountId: details.savingsAccountId ?? defaultSavingsAccountId },
    reading.row.amount,
  );
}

export interface ReviewedRow {
  draft: ImportDraft;
  details: RowDetails;
  /** The account already holds this movement: it is left out of the import. */
  isDuplicate: boolean;
}

export interface ReviewedFile {
  /** Date of the first movement of the file, which sets its place in the import. */
  firstDate: string | null;
  phase: FilePhase;
  rows: readonly ReviewedRow[];
}

export interface ReviewContext {
  currency: string;
  /** The savings account of the savings rows that name none. */
  defaultSavingsAccountId: number | null;
  /** The balances the first file is planned from. */
  accounts: readonly OverflowAccount[];
}

export interface FilePlan {
  /** By position of the row in its file: the parts a savings row is split into. */
  splits: Map<number, SplitSegment[]>;
  /** A loop in the overflow chain spoils every deposit of the file. */
  isChainLooping: boolean;
}

function savingsMovementsOf(
  rows: readonly ReviewedRow[],
  { currency, defaultSavingsAccountId, accounts }: ReviewContext,
): SavingsMovement[] {
  const known = new Set(accounts.map(({ id }) => id));
  return rows.flatMap((row, index) => {
    if (row.isDuplicate || row.details.type !== "savings") return [];
    const savingsAccountId = row.details.savingsAccountId ?? defaultSavingsAccountId;
    if (savingsAccountId === null || !known.has(savingsAccountId)) return [];
    const reading = readImportDraft(row.draft, currency);
    if (!reading.ok) return [];
    return [{ index, date: reading.row.date, amount: reading.row.amount, savingsAccountId }];
  });
}

/**
 * How the savings rows of the files would be split if they were imported now,
 * each file planned from the balances the previous one leaves. A file that is
 * cancelled or could not be read leaves them as they were; one already imported
 * still counts, since `accounts` were read before it. The server plans again from
 * the real balances when a file is imported and has the last word.
 * Returned in the order of `files`.
 */
export function planReview(
  files: readonly ReviewedFile[],
  context: ReviewContext,
): FilePlan[] {
  const plans = files.map((): FilePlan => ({ splits: new Map(), isChainLooping: false }));
  const planned = files.map(({ firstDate, phase, rows }, position) => ({
    position,
    firstDate,
    movements:
      phase === "cancelled" || phase === "failed" ? [] : savingsMovementsOf(rows, context),
  }));

  for (const { file, plan } of planFilesInDateOrder(planned, context.accounts)) {
    const target = plans[file.position];
    if (target === undefined) continue;
    target.isChainLooping = plan.issues.some((issue) => issue.kind === "overflowChainCycle");
    for (const transfer of plan.transfers) {
      target.splits.set(transfer.index, splitSegments(transfer));
    }
  }
  return plans;
}
