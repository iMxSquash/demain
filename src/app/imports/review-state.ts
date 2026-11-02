import type { RowDetails, RowProblem } from "../../domain/import-draft";
import {
  confirmReasons,
  reviewRowProblem,
  type FilePhase,
} from "../../domain/import-review";
import { orderFilesByDate } from "../../domain/import-savings";
import type { ReportedImportIssue } from "./describe-issues";
import type { StagedFile, StagedRowView } from "./import-form-data";

export type EditableField = "date" | "label" | "amount";

/** A row with what is wrong with it, kept up to date as it is edited: the others are not read again. */
export interface ReviewRow extends StagedRowView {
  problem: RowProblem | null;
  /** The type was guessed with little evidence and the user has not chosen one since. */
  needsConfirmation: boolean;
}

/** What the last attempt to import a file said. */
export interface Outcome {
  message: string;
  warnings: string[];
  /** What blocks the file, when the ledger refused it as a whole. */
  issues: ReportedImportIssue[];
}

export interface ReviewFile extends Omit<StagedFile, "rows"> {
  rows: ReviewRow[];
  phase: FilePhase;
  outcome: Outcome | null;
}

export interface ReviewState {
  /** In the order the files are imported. */
  files: ReviewFile[];
  /** The savings account of the savings rows that name none. */
  defaultSavingsAccountId: number | null;
}

export type ReviewAction =
  | { type: "edit"; file: number; row: number; field: EditableField; value: string }
  | { type: "setDetails"; file: number; row: number; details: Partial<RowDetails> }
  | { type: "setDefaultSavings"; savingsAccountId: number | null }
  | { type: "setPhase"; file: number; phase: FilePhase; outcome?: Outcome };

function reviewRow(
  row: StagedRowView,
  currency: string,
  defaultSavingsAccountId: number | null,
): ReviewRow {
  return {
    ...row,
    problem: reviewRowProblem(row.draft, row.details, currency, defaultSavingsAccountId),
    needsConfirmation: confirmReasons(row.guess).length > 0,
  };
}

export function initReview(
  files: readonly StagedFile[],
  defaultSavingsAccountId: number | null,
): ReviewState {
  return {
    defaultSavingsAccountId,
    files: orderFilesByDate(files).map(({ rows, ...file }) => ({
      ...file,
      rows: rows.map((row) => reviewRow(row, file.currency, defaultSavingsAccountId)),
      phase: file.status === "failed" ? "failed" : "reviewing",
      outcome: null,
    })),
  };
}

// A savings row has no category and a row of another type has no savings account.
function mergeDetails(current: RowDetails, patch: Partial<RowDetails>): RowDetails {
  const merged = { ...current, ...patch };
  return merged.type === "savings"
    ? { ...merged, categoryId: null }
    : { ...merged, savingsAccountId: null };
}

function updateFile(
  state: ReviewState,
  index: number,
  update: (file: ReviewFile) => ReviewFile,
): ReviewState {
  const file = state.files[index];
  if (file === undefined) return state;
  const updated = update(file);
  if (updated === file) return state;
  return { ...state, files: state.files.map((other, i) => (i === index ? updated : other)) };
}

// Edited rows are only kept while the file is being reviewed; the outcome of an
// earlier attempt describes rows that are no longer the same.
function updateRow(
  state: ReviewState,
  fileIndex: number,
  rowIndex: number,
  update: (row: ReviewRow, file: ReviewFile) => ReviewRow,
): ReviewState {
  return updateFile(state, fileIndex, (file) => {
    const row = file.rows[rowIndex];
    if (row === undefined || file.phase !== "reviewing") return file;
    return {
      ...file,
      rows: file.rows.map((other, i) => (i === rowIndex ? update(row, file) : other)),
      outcome: null,
    };
  });
}

export function reviewReducer(state: ReviewState, action: ReviewAction): ReviewState {
  const { defaultSavingsAccountId } = state;

  switch (action.type) {
    case "edit":
      return updateRow(state, action.file, action.row, (row, file) => {
        const draft = { ...row.draft, [action.field]: action.value };
        return {
          ...row,
          draft,
          problem: reviewRowProblem(draft, row.details, file.currency, defaultSavingsAccountId),
        };
      });

    case "setDetails":
      return updateRow(state, action.file, action.row, (row, file) => {
        const details = mergeDetails(row.details, action.details);
        return {
          ...row,
          details,
          problem: reviewRowProblem(row.draft, details, file.currency, defaultSavingsAccountId),
          needsConfirmation: action.details.type === undefined && row.needsConfirmation,
        };
      });

    case "setDefaultSavings":
      return {
        defaultSavingsAccountId: action.savingsAccountId,
        files: state.files.map((file) =>
          file.phase !== "reviewing"
            ? file
            : {
                ...file,
                outcome: null,
                rows: file.rows.map((row) =>
                  row.details.type === "savings"
                    ? {
                        ...row,
                        problem: reviewRowProblem(
                          row.draft,
                          row.details,
                          file.currency,
                          action.savingsAccountId,
                        ),
                      }
                    : row,
                ),
              },
        ),
      };

    case "setPhase":
      return updateFile(state, action.file, (file) => ({
        ...file,
        phase: action.phase,
        outcome: action.outcome ?? null,
      }));
  }
}
