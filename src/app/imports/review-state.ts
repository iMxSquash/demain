import {
  amountTextForType,
  type RowDetails,
  type RowProblem,
} from "../../domain/import-draft";
import {
  confirmReasons,
  reviewRowProblem,
  rowConfirmReasons,
  typeAgainstSignReason,
  type ConfirmReason,
  type FilePhase,
} from "../../domain/import-review";
import { orderFilesByDate } from "../../domain/import-savings";
import type { ReportedImportIssue } from "./describe-issues";
import type { StagedFile, StagedRowView } from "./import-form-data";

/** The id a select holds; the empty option means no choice. */
export function parseOptionalId(value: string): number | null {
  return value === "" ? null : Number(value);
}

export type EditableField = "date" | "label" | "amount";

/** A row with what is wrong with it, kept up to date as it is edited: the others are not read again. */
export interface ReviewRow extends StagedRowView {
  /**
   * The amount as the file or the user gave it. The cell shows `draft.amount`,
   * which follows the type; this one decides whether the type goes against the sign.
   */
  sourceAmount: string;
  problem: RowProblem | null;
  /** Why the guessed type is doubtful; emptied once the user chooses a type. */
  guessReasons: ConfirmReason[];
  /** Everything the user is asked to confirm, in text: the guess and a sign taken from the type. */
  confirmReasons: ConfirmReason[];
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
  /** Position of the file among those the user chose, which the review reorders by date. */
  sourceIndex: number;
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
  | { type: "settleAmount"; file: number; row: number }
  | { type: "setDetails"; file: number; row: number; details: Partial<RowDetails> }
  | { type: "setDetailsMany"; file: number; rows: readonly number[]; details: Partial<RowDetails> }
  /** The file was read again, with other columns: its rows start over. */
  | { type: "replaceFile"; file: number; staged: StagedFile }
  | { type: "setDefaultSavings"; savingsAccountId: number | null }
  | { type: "setPhase"; file: number; phase: FilePhase; outcome?: Outcome };

function withConfirmation(
  row: Omit<ReviewRow, "confirmReasons" | "needsConfirmation">,
  currency: string,
): ReviewRow {
  const source = { ...row.draft, amount: row.sourceAmount };
  const reasons = rowConfirmReasons(
    row.guessReasons,
    typeAgainstSignReason(source, row.details, currency),
  );
  return { ...row, confirmReasons: reasons, needsConfirmation: reasons.length > 0 };
}

// The cell shows the amount that will be recorded: the sign follows the type.
function withShownAmount(
  row: Omit<ReviewRow, "confirmReasons" | "needsConfirmation">,
  currency: string,
): Omit<ReviewRow, "confirmReasons" | "needsConfirmation"> {
  const amount = amountTextForType(row.sourceAmount, row.details.type, currency);
  return { ...row, draft: { ...row.draft, amount } };
}

function reviewRow(
  row: StagedRowView,
  currency: string,
  defaultSavingsAccountId: number | null,
): ReviewRow {
  return withConfirmation(
    withShownAmount(
      {
        ...row,
        sourceAmount: row.draft.amount,
        problem: reviewRowProblem(row.draft, row.details, currency, defaultSavingsAccountId),
        guessReasons: confirmReasons(row.guess),
      },
      currency,
    ),
    currency,
  );
}

function reviewFile(
  { rows, ...file }: StagedFile,
  sourceIndex: number,
  defaultSavingsAccountId: number | null,
): ReviewFile {
  return {
    ...file,
    sourceIndex,
    rows: rows.map((row) => reviewRow(row, file.currency, defaultSavingsAccountId)),
    phase: file.status === "failed" ? "failed" : "reviewing",
    outcome: null,
  };
}

export function initReview(
  files: readonly StagedFile[],
  defaultSavingsAccountId: number | null,
): ReviewState {
  const chosen = files.map((file, index) => ({ ...file, sourceIndex: index }));
  return {
    defaultSavingsAccountId,
    files: orderFilesByDate(chosen).map(({ sourceIndex, ...file }) =>
      reviewFile(file, sourceIndex, defaultSavingsAccountId),
    ),
  };
}

/** The rows that wait for the user to confirm them. */
export function countRowsToConfirm(rows: readonly ReviewRow[]): number {
  return rows.filter((row) => row.needsConfirmation).length;
}

/** Positions of the rows the table shows: all of them, or only those to confirm. */
export function visibleRowIndexes(
  rows: readonly ReviewRow[],
  onlyToConfirm: boolean,
): number[] {
  return rows.flatMap((row, index) => (onlyToConfirm && !row.needsConfirmation ? [] : [index]));
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
function updateRows(
  state: ReviewState,
  fileIndex: number,
  rowIndexes: readonly number[],
  update: (row: ReviewRow, file: ReviewFile) => ReviewRow,
): ReviewState {
  return updateFile(state, fileIndex, (file) => {
    const targets = new Set(rowIndexes.filter((index) => file.rows[index] !== undefined));
    if (targets.size === 0 || file.phase !== "reviewing") return file;
    return {
      ...file,
      rows: file.rows.map((row, i) => (targets.has(i) ? update(row, file) : row)),
      outcome: null,
    };
  });
}

function updateRow(
  state: ReviewState,
  fileIndex: number,
  rowIndex: number,
  update: (row: ReviewRow, file: ReviewFile) => ReviewRow,
): ReviewState {
  return updateRows(state, fileIndex, [rowIndex], update);
}

function applyDetails(
  row: ReviewRow,
  file: ReviewFile,
  patch: Partial<RowDetails>,
  defaultSavingsAccountId: number | null,
): ReviewRow {
  const details = mergeDetails(row.details, patch);
  const shown = withShownAmount({ ...row, details }, file.currency);
  return withConfirmation(
    {
      ...shown,
      problem: reviewRowProblem(shown.draft, details, file.currency, defaultSavingsAccountId),
      guessReasons: patch.type === undefined ? row.guessReasons : [],
    },
    file.currency,
  );
}

export function reviewReducer(state: ReviewState, action: ReviewAction): ReviewState {
  const { defaultSavingsAccountId } = state;

  switch (action.type) {
    case "edit":
      return updateRow(state, action.file, action.row, (row, file) => {
        const draft = { ...row.draft, [action.field]: action.value };
        return withConfirmation(
          {
            ...row,
            draft,
            sourceAmount: action.field === "amount" ? action.value : row.sourceAmount,
            problem: reviewRowProblem(draft, row.details, file.currency, defaultSavingsAccountId),
          },
          file.currency,
        );
      });

    case "settleAmount":
      return updateRow(state, action.file, action.row, (row, file) =>
        withConfirmation(withShownAmount(row, file.currency), file.currency),
      );

    case "setDetails":
      return updateRow(state, action.file, action.row, (row, file) =>
        applyDetails(row, file, action.details, defaultSavingsAccountId),
      );

    case "setDetailsMany":
      return updateRows(state, action.file, action.rows, (row, file) =>
        applyDetails(row, file, action.details, defaultSavingsAccountId),
      );

    case "replaceFile":
      return updateFile(state, action.file, (file) =>
        file.phase === "reviewing"
          ? reviewFile(action.staged, file.sourceIndex, defaultSavingsAccountId)
          : file,
      );

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
