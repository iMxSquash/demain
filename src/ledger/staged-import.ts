import {
  readImportDraft,
  type DraftProblem,
  type ImportDraft,
} from "../domain/import-draft";
import type { ImportedRow } from "../domain/import-row";
import type { AppDatabase } from "../storage/database";
import { getAccount } from "./accounts";
import {
  commitImport,
  type CommitImportRequest,
  type ImportResult,
} from "./imports";

export interface CommitDraftsRequest extends Omit<CommitImportRequest, "rows"> {
  drafts: readonly ImportDraft[];
}

export interface DraftRowProblem {
  /** Position in `drafts`. */
  index: number;
  problem: DraftProblem;
}

export type CommitDraftsResult =
  | ({ status: "done" } & ImportResult)
  | { status: "invalid"; problems: DraftRowProblem[] };

/**
 * Records a reviewed file. The texts the user edited are read again here:
 * nothing from the browser is trusted, and one row still wrong records nothing.
 */
export function commitDrafts(
  db: AppDatabase,
  request: CommitDraftsRequest,
): CommitDraftsResult {
  const { drafts, ...rest } = request;
  const { currency } = getAccount(db, request.accountId);
  const rows: ImportedRow[] = [];
  const problems: DraftRowProblem[] = [];
  drafts.forEach((draft, index) => {
    const reading = readImportDraft(draft, currency);
    if (reading.ok) rows.push(reading.row);
    else problems.push({ index, problem: reading.problem });
  });
  if (problems.length > 0) return { status: "invalid", problems };

  return { status: "done", ...commitImport(db, { ...rest, rows }) };
}
