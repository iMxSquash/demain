import type { ColumnChoices } from "../../domain/import-columns";
import type { CsvMapping } from "../../domain/import-csv";
import { draftOfRow } from "../../domain/import-draft";
import type { TypeVocabulary } from "../../domain/import-guess";
import {
  stageCsvRows,
  stageMovementFile,
  typeRowsBySign,
  type StagedCategory,
  type TypedStagedRow,
} from "../../domain/import-staging";
import type { ImportFormat } from "../../ledger/imports";
import type { StagedColumns } from "./import-form-data";
import { readCsv, readOfx } from "./read-statement";

export type StagedStatement =
  | {
      status: "ready";
      format: ImportFormat;
      /** The CSV mapping that read the file; null for OFX. */
      mapping: CsvMapping | null;
      /** Null unless the layout of the CSV file was analyzed. */
      columns: StagedColumns | null;
      rows: TypedStagedRow[];
    }
  /** A CSV file whose columns neither the analysis nor the last import found. */
  | { status: "mappingNeeded" }
  /** The dates have no year, and neither the user nor the file name gives one. */
  | { status: "yearMissing" };

export interface StatementContext {
  fileName: string;
  accountId: number;
  currency: string;
  categories: readonly StagedCategory[];
  /** The words of a category that give the type. */
  vocabulary: TypeVocabulary;
  /** The columns the user assigned to the roles, over the detected ones. */
  columns?: ColumnChoices;
}

function stageOfx(text: string, currency: string): StagedStatement {
  const { rows } = readOfx(text, currency);
  return {
    status: "ready",
    format: "ofx",
    mapping: null,
    columns: null,
    rows: typeRowsBySign(
      rows.map((row, index) => ({
        line: index + 1,
        rawDate: null,
        draft: draftOfRow(row, currency),
      })),
      currency,
    ),
  };
}

// The mapping of the last import, or the guess on the header row: kept for a
// file the analysis cannot read, so that a mapping fixed by hand is not lost.
function stageWithSavedMapping(
  text: string,
  { accountId, currency }: StatementContext,
): StagedStatement {
  const reading = readCsv(text, null, accountId, currency);
  if (reading.used === null) return { status: "mappingNeeded" };
  return {
    status: "ready",
    format: "csv",
    mapping: reading.used,
    columns: null,
    rows: typeRowsBySign(
      stageCsvRows(reading.table, reading.used, currency),
      currency,
    ),
  };
}

/**
 * A statement as typed rows to review. A CSV file is read by its own layout
 * (types, categories, payment modes); only when the analysis finds no columns
 * does the mapping of the last import read it, and then the sign decides the type.
 */
export function stageStatement(
  text: string,
  format: ImportFormat,
  context: StatementContext,
): StagedStatement {
  if (format === "ofx") return stageOfx(text, context.currency);

  const staged = stageMovementFile(
    text,
    {
      currency: context.currency,
      source: context.fileName,
      columns: context.columns,
      vocabulary: context.vocabulary,
    },
    context.categories,
  );
  const { analysis } = staged.reading;
  if (analysis.mapping === null) return stageWithSavedMapping(text, context);
  // Without a year every date is unreadable: say so rather than show no row.
  if (analysis.issues.some((issue) => issue.kind === "dateYearMissing")) {
    return { status: "yearMissing" };
  }
  return {
    status: "ready",
    format: "csv",
    mapping: analysis.mapping,
    columns: {
      roles: {
        typeColumn: analysis.typeColumn,
        paymentModeColumn: analysis.paymentModeColumn,
        categoryColumn: analysis.categoryColumn,
        descriptionColumn: analysis.descriptionColumn,
      },
      available: analysis.roleColumns,
    },
    rows: staged.rows,
  };
}
