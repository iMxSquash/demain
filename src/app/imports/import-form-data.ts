import type { RoleColumn } from "../../domain/import-analysis";
import type { ColumnChoices } from "../../domain/import-columns";
import {
  CSV_DATE_FORMATS,
  CSV_DELIMITERS,
  type CsvAmountMapping,
  type CsvDateFormat,
  type CsvDelimiter,
  type CsvMapping,
} from "../../domain/import-csv";
import type { RowProblem } from "../../domain/import-draft";
import { looksLikeOfx } from "../../domain/import-ofx";
import type { SavingsAccountChoice } from "../../domain/import-savings";
import type { TypedStagedRow } from "../../domain/import-staging";
import type { OverflowAccount } from "../../domain/overflow";
import type { Account } from "../../ledger/accounts";
import type { Category } from "../../ledger/categories";
import type { ImportFormat } from "../../ledger/imports";
import type { ReportedImportIssue } from "./describe-issues";

/** Largest file accepted. `serverActions.bodySizeLimit` in next.config.ts must stay above it. */
export const MAX_IMPORT_FILE_BYTES = 20 * 1024 * 1024;

export const AMOUNT_KINDS = ["single", "split"] as const;

/** The mapping as the form shows it: columns are numbered from 1, as in a spreadsheet. */
export interface MappingFields {
  delimiter: CsvDelimiter;
  hasHeader: boolean;
  dateColumn: string;
  dateFormat: CsvDateFormat;
  labelColumn: string;
  amountKind: CsvAmountMapping["kind"];
  amountColumn: string;
  debitColumn: string;
  creditColumn: string;
}

export interface SampleRow {
  date: string;
  label: string;
  amount: string;
}

export interface ImportFormState {
  status: "error" | "preview" | "done";
  /** Translated headline: the error, or what the preview and the import found. */
  message: string;
  /** What was selected, sent back because React resets the form after an action. */
  accountId: string;
  format: ImportFormat | null;
  /** Null for an OFX file; for a CSV file, what the mapping fields start from. */
  mapping: MappingFields | null;
  /** First rows of a CSV as they are, to read the column numbers from. */
  rawRows: string[][];
  sampleRows: SampleRow[];
  /** Translated, one per rejected row (the first ones). */
  problems: string[];
  /** Translated, for the ceiling and for an archived account. */
  warnings: string[];
  canImport: boolean;
}

/** An active account as the import page offers it: enough to choose it and to choose a savings account. */
export interface ImportAccountOption extends SavingsAccountChoice {
  name: string;
}

export interface ImportCategoryOption {
  id: number;
  name: string;
}

/** What the import page hands to the browser. */
export interface ImportView {
  /** The active accounts. */
  accounts: ImportAccountOption[];
  /** The active categories. */
  categories: ImportCategoryOption[];
  /** The balances of every account, archived ones included: the snapshot the savings rows are planned from. */
  overflowAccounts: OverflowAccount[];
}

export function toImportView(
  accounts: readonly Account[],
  categories: readonly Category[],
  overflowAccounts: readonly OverflowAccount[],
): ImportView {
  return {
    accounts: accounts.map(
      ({ id, name, kind, currency, archived, overflowAccountId }) => ({
        id,
        name,
        kind,
        currency,
        archived,
        overflowAccountId,
      }),
    ),
    categories: categories.map(({ id, name }) => ({ id, name })),
    overflowAccounts: overflowAccounts.map((account) => ({ ...account })),
  };
}

export interface StagedRowView extends TypedStagedRow {
  /** The account already holds this movement: it is left out when the file is imported. */
  isDuplicate: boolean;
}

/** The columns of a CSV file that hold the optional roles, and those that could. */
export interface StagedColumns {
  roles: Required<ColumnChoices>;
  /** Every column that holds none of the date, the label and the amount. */
  available: RoleColumn[];
}

/** One file of a multi-file import, read and waiting for the user's decision. */
export interface StagedFile {
  fileName: string;
  status: "ready" | "failed";
  /** Translated; what went wrong when `status` is "failed". */
  message: string;
  format: ImportFormat | null;
  /** The CSV mapping that read the file: recorded with the batch, offered at the next import. */
  mapping: CsvMapping | null;
  currency: string;
  /** Earliest date of the rows, which orders the files of an import; null when none can be read. */
  firstDate: string | null;
  /** A CSV file whose columns were not found: the form of the column mapping reads it. */
  needsMapping: boolean;
  /** Null for an OFX statement, and for a CSV read with a saved mapping rather than by its layout. */
  columns: StagedColumns | null;
  rows: StagedRowView[];
}

/** A file that gave nothing to review: its card says why. */
export function failedStagedFile(
  fileName: string,
  message: string,
  { needsMapping = false }: { needsMapping?: boolean } = {},
): StagedFile {
  return {
    fileName,
    status: "failed",
    message,
    format: null,
    mapping: null,
    currency: "",
    firstDate: null,
    needsMapping,
    columns: null,
    rows: [],
  };
}

export interface CommitStagedState {
  /** "blocked": the ledger refuses the file as a whole, `issues` says why. */
  status: "done" | "invalid" | "blocked" | "error";
  /** Translated. */
  message: string;
  /** Translated, for the ceiling and for an archived account. */
  warnings: string[];
  /** Position in the file's rows, for each row the server still refuses. */
  problems: { index: number; problem: RowProblem }[];
  /** Translated, what blocks the file; each one points at its row when it has one. */
  issues: ReportedImportIssue[];
}

/** Decodes as UTF-8, or as Windows-1252 when the bytes are not valid UTF-8 (older bank exports). */
export function decodeImportFile(bytes: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    if (!(error instanceof TypeError)) throw error;
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

export function detectImportFormat(text: string): ImportFormat {
  return looksLikeOfx(text) ? "ofx" : "csv";
}

function oneBased(column: number): string {
  return String(column + 1);
}

export function mappingToFields(mapping: CsvMapping): MappingFields {
  const amount = mapping.amount;
  return {
    delimiter: mapping.delimiter,
    hasHeader: mapping.hasHeader,
    dateColumn: oneBased(mapping.dateColumn),
    dateFormat: mapping.dateFormat,
    labelColumn: oneBased(mapping.labelColumn),
    amountKind: amount.kind,
    amountColumn: amount.kind === "single" ? oneBased(amount.column) : "",
    debitColumn: amount.kind === "split" ? oneBased(amount.debitColumn) : "",
    creditColumn: amount.kind === "split" ? oneBased(amount.creditColumn) : "",
  };
}

function readColumn(formData: FormData, name: string): number | null {
  const text = String(formData.get(name) ?? "").trim();
  if (!/^\d{1,3}$/.test(text)) return null;
  const column = Number(text);
  return column >= 1 ? column - 1 : null;
}

function readChoice<T extends string>(
  formData: FormData,
  name: string,
  choices: readonly T[],
): T | null {
  const value = formData.get(name);
  return choices.find((choice) => choice === value) ?? null;
}

/** What the mapping fields hold; null when they are blank, absent or incoherent. */
export function readMappingFields(formData: FormData): CsvMapping | null {
  if (formData.get("mappingPresent") !== "1") return null;
  const delimiter = readChoice(formData, "delimiter", CSV_DELIMITERS);
  const dateFormat = readChoice(formData, "dateFormat", CSV_DATE_FORMATS);
  const amountKind = readChoice(formData, "amountKind", AMOUNT_KINDS);
  const dateColumn = readColumn(formData, "dateColumn");
  const labelColumn = readColumn(formData, "labelColumn");
  if (
    delimiter === null ||
    dateFormat === null ||
    amountKind === null ||
    dateColumn === null ||
    labelColumn === null
  ) {
    return null;
  }

  let amount: CsvAmountMapping;
  if (amountKind === "single") {
    const column = readColumn(formData, "amountColumn");
    if (column === null) return null;
    amount = { kind: "single", column };
  } else {
    const debitColumn = readColumn(formData, "debitColumn");
    const creditColumn = readColumn(formData, "creditColumn");
    if (debitColumn === null || creditColumn === null) return null;
    amount = { kind: "split", debitColumn, creditColumn };
  }

  return {
    delimiter,
    hasHeader: formData.get("hasHeader") === "on",
    dateColumn,
    dateFormat,
    labelColumn,
    amount,
  };
}

const COLUMN_CHOICE_FIELDS = [
  "typeColumn",
  "paymentModeColumn",
  "categoryColumn",
  "descriptionColumn",
] as const;

/** The roles as the form sends them: a 0-based column number, or "none". */
export type ColumnChoiceFields = Record<(typeof COLUMN_CHOICE_FIELDS)[number], string>;

/** Sent when the user says the file has no column for a role. */
export const NO_COLUMN_CHOICE = "none";

/**
 * The columns the user assigned to the roles, 0-based. A field that is absent,
 * empty or not a column number leaves its role to the detection.
 */
export function readColumnChoices(formData: FormData): ColumnChoices {
  const choices: ColumnChoices = {};
  for (const name of COLUMN_CHOICE_FIELDS) {
    const text = String(formData.get(name) ?? "").trim();
    if (text === NO_COLUMN_CHOICE) choices[name] = null;
    else if (/^\d{1,3}$/.test(text)) choices[name] = Number(text);
  }
  return choices;
}

/** What the actions of the overflow prompt answer. */
export type OverflowActionState =
  | { status: "done" }
  /** The new account, as the plan sees it, and its name for the selects. */
  | { status: "created"; account: OverflowAccount; name: string }
  /** Translated. */
  | { status: "error"; message: string };
