"use server";

import { getLocale, getTranslations } from "next-intl/server";

import {
  chooseCsvMapping,
  detectDelimiter,
  parseCsv,
  suggestCsvMapping,
  type CsvMapping,
  type CsvReading,
} from "../../domain/import-csv";
import { parseOfx } from "../../domain/import-ofx";
import { ImportParseError } from "../../domain/import-row";
import { formatAmount } from "../../domain/money";
import { formatCalendarDate } from "../../i18n/dates";
import { AccountNotFoundError, getAccount } from "../../ledger/accounts";
import {
  commitImport,
  getLastCsvMapping,
  previewImport,
  type ImportFormat,
} from "../../ledger/imports";
import { withDatabase } from "../../storage/with-database";
import { revalidateLedger } from "../revalidate-ledger";
import { requireSession } from "../auth/session";
import { getTranslator } from "../translator";
import {
  decodeImportFile,
  detectImportFormat,
  MAX_IMPORT_FILE_BYTES,
  mappingToFields,
  readMappingFields,
  type ImportFormState,
  type MappingFields,
} from "./import-form-data";

const IMPORT_INTENT = "import";
const RAW_ROW_COUNT = 5;
const SAMPLE_ROW_COUNT = 5;
const PROBLEM_COUNT = 10;
const WARNING_COUNT = 20;
const MAX_FILE_NAME_LENGTH = 255;
const BYTES_PER_MEGABYTE = 1024 * 1024;

const emptyMappingFields = (
  delimiter: CsvMapping["delimiter"],
): MappingFields => ({
  delimiter,
  hasHeader: true,
  dateColumn: "",
  dateFormat: "dmy",
  labelColumn: "",
  amountKind: "single",
  amountColumn: "",
  debitColumn: "",
  creditColumn: "",
});

/** What was read from a file, in the shape both formats share. */
interface StatementReading extends CsvReading {
  /** What the mapping fields start from: null for OFX. */
  mapping: MappingFields | null;
  /** First rows of a CSV as they are, to read the column numbers from. */
  rawRows: string[][];
  /** The CSV mapping that produced `rows`, null for OFX or while the columns are unknown. */
  used: CsvMapping | null;
}

function readOfx(text: string, currency: string): StatementReading {
  return {
    rows: parseOfx(text, currency),
    errors: [],
    mapping: null,
    rawRows: [],
    used: null,
  };
}

// The mapping comes from the form once the user has seen it. Before that, the
// one of the last import on the account is tried first, then a guess on the
// header row: the first that reads the whole file wins, otherwise the first
// one is kept so that the user sees what is wrong and can fix it.
function readCsv(
  text: string,
  formData: FormData,
  accountId: number,
  currency: string,
): StatementReading {
  const submitted = readMappingFields(formData);
  const delimiter = submitted?.delimiter ?? detectDelimiter(text);
  const parsed = parseCsv(text, delimiter);
  const rawRows = parsed.slice(0, RAW_ROW_COUNT);

  const saved = withDatabase((db) => getLastCsvMapping(db, accountId));
  const candidates = submitted
    ? [submitted]
    : [
        saved?.delimiter === delimiter ? saved : null,
        suggestCsvMapping(parsed[0] ?? [], delimiter),
      ].filter((candidate): candidate is CsvMapping => candidate !== null);

  const chosen = chooseCsvMapping(parsed, candidates, currency);
  if (chosen === null) {
    return {
      rows: [],
      errors: [],
      mapping: emptyMappingFields(delimiter),
      rawRows,
      used: null,
    };
  }
  return {
    ...chosen.reading,
    mapping: mappingToFields(chosen.mapping),
    rawRows,
    used: chosen.mapping,
  };
}

export async function importAction(
  _previous: ImportFormState | null,
  formData: FormData,
): Promise<ImportFormState> {
  await requireSession();
  const [t, translate, locale] = await Promise.all([
    getTranslations("imports"),
    getTranslator(),
    getLocale(),
  ]);
  const accountText = String(formData.get("accountId") ?? "");
  const base: ImportFormState = {
    status: "error",
    message: "",
    accountId: accountText,
    format: null,
    mapping: null,
    rawRows: [],
    sampleRows: [],
    problems: [],
    warnings: [],
    canImport: false,
  };
  const fail = (message: string): ImportFormState => ({ ...base, message });
  // The line comes from the error, not from its text: every cause reads the same way.
  const describe = (error: ImportParseError): string => {
    const message = translate(error.ref);
    return error.line === null
      ? message
      : t("problemAtLine", { line: error.line, message });
  };

  const accountId = Number(accountText);
  if (!Number.isInteger(accountId) || accountId < 1) {
    return fail(t("accountRequired"));
  }
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return fail(file instanceof File ? t("fileEmpty") : t("fileRequired"));
  }
  if (file.size > MAX_IMPORT_FILE_BYTES) {
    return fail(
      t("fileTooLarge", { max: MAX_IMPORT_FILE_BYTES / BYTES_PER_MEGABYTE }),
    );
  }

  try {
    const account = withDatabase((db) => getAccount(db, accountId));
    const text = decodeImportFile(await file.arrayBuffer());
    const format: ImportFormat = detectImportFormat(text);

    const { rows, errors, mapping, rawRows, used } =
      format === "ofx"
        ? readOfx(text, account.currency)
        : readCsv(text, formData, accountId, account.currency);

    const problems = errors.slice(0, PROBLEM_COUNT).map(describe);
    if (errors.length > PROBLEM_COUNT) {
      problems.push(
        t("moreProblems", { count: errors.length - PROBLEM_COUNT }),
      );
    }
    const sampleRows = rows.slice(0, SAMPLE_ROW_COUNT).map((row) => ({
      date: formatCalendarDate(row.date, locale),
      label: row.label,
      amount: formatAmount(row.amount, account.currency, locale),
    }));
    const shown: ImportFormState = {
      ...base,
      status: "preview",
      format,
      mapping,
      rawRows,
      sampleRows,
      problems,
    };

    // Nothing is imported while a row is unreadable: skipping it would lose a movement silently.
    if (format === "csv" && used === null) {
      return { ...shown, message: t("mappingNeeded") };
    }
    if (errors.length > 0) return { ...shown, message: t("fixProblems") };

    const isImport = formData.get("intent") === IMPORT_INTENT;
    const outcome = withDatabase((db) =>
      isImport
        ? commitImport(db, {
            accountId,
            format,
            fileName: file.name.slice(0, MAX_FILE_NAME_LENGTH),
            mapping: used,
            rows,
            now: new Date(),
          })
        : previewImport(db, { accountId, rows }),
    );
    const warnings = outcome.ceilingWarnings
      .slice(0, WARNING_COUNT)
      .map((warning) =>
        t("ceilingWarning", {
          label: warning.label,
          date: formatCalendarDate(warning.date, locale),
          excess: formatAmount(warning.excess, account.currency, locale),
        }),
      );
    if (outcome.accountArchived) warnings.push(t("archivedWarning"));

    const canImport = outcome.newCount > 0;
    if (!canImport)
      return { ...shown, warnings, message: t("nothingToImport") };
    if (!isImport) {
      return {
        ...shown,
        warnings,
        canImport,
        message: t("previewSummary", {
          newCount: outcome.newCount,
          duplicateCount: outcome.duplicateCount,
        }),
      };
    }

    revalidateLedger();
    return {
      ...shown,
      status: "done",
      warnings,
      message: t("imported", {
        imported: outcome.newCount,
        duplicates: outcome.duplicateCount,
      }),
    };
  } catch (error) {
    if (error instanceof ImportParseError) return fail(describe(error));
    if (error instanceof AccountNotFoundError)
      return fail(translate({ key: "accountGone" }));
    throw error;
  }
}
