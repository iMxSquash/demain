import {
  checkRowDetails,
  readImportDraft,
  type ReviewedDraft,
  type RowDetails,
  type RowProblem,
} from "../domain/import-draft";
import type { AppDatabase } from "../storage/database";
import { getAccount } from "./accounts";
import {
  commitImport,
  ImportBlockedError,
  type CommitImportRequest,
  type ImportIssue,
  type ImportResult,
  type ImportRow,
} from "./imports";

export interface CommitDraftsRequest extends Omit<CommitImportRequest, "rows"> {
  drafts: readonly ReviewedDraft[];
}

export interface DraftRowProblem {
  /** Position in `drafts`. */
  index: number;
  problem: RowProblem;
}

export type CommitDraftsResult =
  | ({ status: "done" } & ImportResult)
  | { status: "invalid"; problems: DraftRowProblem[] }
  | { status: "blocked"; issues: ImportIssue[] };

/**
 * Records a reviewed file. The texts the user edited are read again here:
 * nothing from the browser is trusted, and one row still wrong records nothing.
 * The details of a review (type, category, savings account) are checked against
 * the amount read here, not against what the browser displayed. A file the
 * ledger refuses as a whole, such as a deposit that fits nowhere, is reported
 * as blocked: `commitImport` plans before it writes, so nothing is left behind.
 */
export function commitDrafts(
  db: AppDatabase,
  request: CommitDraftsRequest,
): CommitDraftsResult {
  const { drafts, ...rest } = request;
  const { currency } = getAccount(db, request.accountId);
  const rows: ImportRow[] = [];
  const problems: DraftRowProblem[] = [];
  drafts.forEach((draft, index) => {
    const reading = readImportDraft(draft, currency);
    if (!reading.ok) {
      problems.push({ index, problem: reading.problem });
      return;
    }
    const given = draft.details;
    // Same fallback as planRow: a row that names no savings account takes the
    // one of the request, so the check sees the account that will be used.
    const details: RowDetails | undefined =
      given === undefined
        ? undefined
        : { ...given, savingsAccountId: given.savingsAccountId ?? rest.savingsAccountId ?? null };
    const problem =
      details === undefined ? null : checkRowDetails(details, reading.row.amount);
    if (problem !== null) {
      problems.push({ index, problem });
      return;
    }
    rows.push(details === undefined ? reading.row : { ...reading.row, details });
  });
  if (problems.length > 0) return { status: "invalid", problems };

  try {
    return { status: "done", ...commitImport(db, { ...rest, rows }) };
  } catch (error) {
    if (error instanceof ImportBlockedError) {
      return { status: "blocked", issues: [...error.issues] };
    }
    throw error;
  }
}
