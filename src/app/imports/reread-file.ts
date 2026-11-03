import {
  NO_COLUMN_CHOICE,
  type ColumnChoiceFields,
  type StagedColumns,
  type StagedFile,
} from "./import-form-data";
import type { ReviewAction } from "./review-state";

/** The assignment the column selects show, as the fields that read the file with it. */
export function columnChoicesOf({ roles }: StagedColumns): ColumnChoiceFields {
  const field = (column: number | null) => (column === null ? NO_COLUMN_CHOICE : String(column));
  return {
    typeColumn: field(roles.typeColumn),
    paymentModeColumn: field(roles.paymentModeColumn),
    categoryColumn: field(roles.categoryColumn),
    descriptionColumn: field(roles.descriptionColumn),
  };
}

/**
 * Reads a file of the review again and tells the review what came out. A failed
 * reading keeps the rows and records why; resolves to whether the new rows are in.
 */
export async function rereadFile(
  fileIndex: number,
  read: () => Promise<StagedFile>,
  dispatch: (action: ReviewAction) => void,
): Promise<boolean> {
  const staged = await read();
  if (staged.status === "failed") {
    dispatch({ type: "rereadFailed", file: fileIndex, message: staged.message });
    return false;
  }
  dispatch({ type: "replaceFile", file: fileIndex, staged });
  return true;
}
