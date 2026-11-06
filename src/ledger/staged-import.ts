import {
  checkRowDetails,
  readImportDraft,
  withDefaultSavingsAccount,
  type ReviewedDraft,
  type RowDetails,
  type RowProblem,
} from "../domain/import-draft";
import type { PendingOverflow } from "../domain/import-overflow";
import type { AppDatabase } from "../storage/database";
import { getAccount } from "./accounts";
import { applyImportOverflowChoices } from "./import-overflow";
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
  /** What the review chose for the accounts whose surplus has nowhere to go. */
  overflow?: {
    choices: readonly PendingOverflow[];
    /** YYYY-MM-DD, the opening date of the accounts the choices create. */
    openingDate: string;
  };
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
 * The overflow accounts chosen in the review are saved in the same transaction
 * as the file: a file that is not recorded leaves no account and no link behind,
 * and a choice the ledger refuses refuses the file (the error is thrown).
 */
export function commitDrafts(
  db: AppDatabase,
  request: CommitDraftsRequest,
): CommitDraftsResult {
  const { overflow, ...file } = request;
  if (overflow === undefined) {
    return commitReviewedDrafts(db, file);
  }
  // The native transaction nests the one of `commitImport` as a savepoint.
  const run = db.$client.transaction((): CommitDraftsResult => {
    applyImportOverflowChoices(db, {
      receivingAccountId: file.accountId,
      choices: overflow.choices,
      openingDate: overflow.openingDate,
    });
    const result = commitReviewedDrafts(db, file);
    // Not recorded: the accounts and links made for it go with it.
    if (result.status !== "done") throw new FileNotRecorded(result);
    return result;
  });
  try {
    return run();
  } catch (error) {
    if (error instanceof FileNotRecorded) return error.result;
    throw error;
  }
}

class FileNotRecorded extends Error {
  constructor(readonly result: Exclude<CommitDraftsResult, { status: "done" }>) {
    super("The file is not recorded");
    this.name = "FileNotRecorded";
  }
}

function commitReviewedDrafts(
  db: AppDatabase,
  request: Omit<CommitDraftsRequest, "overflow">,
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
        : withDefaultSavingsAccount(given, rest.savingsAccountId);
    const problem = details === undefined ? null : checkRowDetails(details);
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
