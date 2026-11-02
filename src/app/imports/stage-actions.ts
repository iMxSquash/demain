"use server";

import { getLocale, getTranslations } from "next-intl/server";
import { z } from "zod";

import { draftOfRow, readImportDraft } from "../../domain/import-draft";
import { ImportParseError } from "../../domain/import-row";
import { stageCsvRows, type StagedRow } from "../../domain/import-staging";
import { messageRef } from "../../domain/message";
import { formatAmount } from "../../domain/money";
import { formatCalendarDate } from "../../i18n/dates";
import { AccountNotFoundError, getAccount } from "../../ledger/accounts";
import {
  csvMappingSchema,
  findDuplicateRows,
  type ImportFormat,
} from "../../ledger/imports";
import { commitDrafts } from "../../ledger/staged-import";
import { withDatabase } from "../../storage/with-database";
import { requireSession } from "../auth/session";
import { flashError, flashSuccess } from "../feedback/flash";
import { revalidateLedger } from "../revalidate-ledger";
import { getTranslator } from "../translator";
import {
  decodeImportFile,
  detectImportFormat,
  failedStagedFile,
  MAX_IMPORT_FILE_BYTES,
  type CommitStagedState,
  type StagedFile,
} from "./import-form-data";
import { readCsv, readOfx } from "./read-statement";

const MAX_FILE_NAME_LENGTH = 255;
const MAX_CELL_LENGTH = 1_000;
const MAX_ROWS = 50_000;
const WARNING_COUNT = 20;
const BYTES_PER_MEGABYTE = 1024 * 1024;

const commitRequestSchema = z.object({
  accountId: z.number().int().min(1),
  fileName: z.string().max(MAX_FILE_NAME_LENGTH),
  format: z.enum(["csv", "ofx"]),
  mapping: csvMappingSchema.nullable(),
  drafts: z
    .array(
      z.object({
        date: z.string().max(MAX_CELL_LENGTH),
        label: z.string().max(MAX_CELL_LENGTH),
        amount: z.string().max(MAX_CELL_LENGTH),
        externalId: z.string().max(MAX_CELL_LENGTH).nullable(),
      }),
    )
    .max(MAX_ROWS),
});

export type CommitStagedRequest = z.input<typeof commitRequestSchema>;

/**
 * Reads one file of a multi-file import and records nothing. The browser calls
 * this once per file, in turn: a file that cannot be read does not stop the
 * next one, and each request stays under the upload limit.
 */
export async function stageFileAction(formData: FormData): Promise<StagedFile> {
  await requireSession();
  const [t, translate] = await Promise.all([
    getTranslations("imports"),
    getTranslator(),
  ]);
  const file = formData.get("file");
  const fileName =
    file instanceof File ? file.name.slice(0, MAX_FILE_NAME_LENGTH) : "";
  const failed = (message: string): StagedFile =>
    failedStagedFile(fileName, message);

  const accountId = Number(formData.get("accountId"));
  if (!Number.isInteger(accountId) || accountId < 1) {
    return failed(t("accountRequired"));
  }
  if (!(file instanceof File) || file.size === 0) return failed(t("fileEmpty"));
  if (file.size > MAX_IMPORT_FILE_BYTES) {
    return failed(
      t("fileTooLarge", { max: MAX_IMPORT_FILE_BYTES / BYTES_PER_MEGABYTE }),
    );
  }

  try {
    const { currency } = withDatabase((db) => getAccount(db, accountId));
    const text = decodeImportFile(await file.arrayBuffer());
    const format: ImportFormat = detectImportFormat(text);

    const reading =
      format === "ofx"
        ? readOfx(text, currency)
        : readCsv(text, null, accountId, currency);
    if (format === "csv" && reading.used === null) {
      return failed(t("staged.mappingNeeded"));
    }

    const staged: StagedRow[] =
      reading.used === null
        ? reading.rows.map((row, index) => ({
            line: index + 1,
            rawDate: null,
            draft: draftOfRow(row, currency),
          }))
        : stageCsvRows(reading.table, reading.used, currency);
    const isDuplicate = duplicateFlags(accountId, staged, currency);

    return {
      fileName,
      status: "ready",
      message: "",
      format,
      mapping: reading.used,
      currency,
      rows: staged.map((row, index) => ({
        ...row,
        isDuplicate: isDuplicate[index] ?? false,
      })),
    };
  } catch (error) {
    if (error instanceof ImportParseError) {
      return failed(
        t("problemAtLine", {
          line: error.line ?? 0,
          message: translate(error.ref),
        }),
      );
    }
    if (error instanceof AccountNotFoundError) {
      return failed(translate({ key: "accountGone" }));
    }
    // Unexpected failures are logged with their detail, the user sees a generic message.
    console.error("Import staging failed", error);
    return failed(translate(messageRef("importFailed")));
  }
}

// A row the file gives unreadably cannot be compared yet: it is not flagged.
function duplicateFlags(
  accountId: number,
  staged: readonly StagedRow[],
  currency: string,
): boolean[] {
  const readings = staged.map(({ draft }) => readImportDraft(draft, currency));
  const rows = readings.flatMap((reading) => (reading.ok ? [reading.row] : []));
  const flags = withDatabase((db) =>
    findDuplicateRows(db, { accountId, rows }),
  );

  let next = 0;
  return readings.map((reading) =>
    reading.ok ? (flags[next++] ?? false) : false,
  );
}

/**
 * Records one reviewed file, as the user left it. This is the only moment
 * anything is written. Every text is read again: the browser is not trusted.
 */
export async function commitStagedFileAction(
  request: CommitStagedRequest,
): Promise<CommitStagedState> {
  await requireSession();
  const [t, translate, locale] = await Promise.all([
    getTranslations("imports"),
    getTranslator(),
    getLocale(),
  ]);
  const fail = (message: string): CommitStagedState => ({
    status: "error",
    message,
    warnings: [],
    problems: [],
  });

  const parsed = commitRequestSchema.safeParse(request);
  if (!parsed.success) return fail(translate(messageRef("importFailed")));

  try {
    const { currency, outcome } = withDatabase((db) => ({
      currency: getAccount(db, parsed.data.accountId).currency,
      outcome: commitDrafts(db, { ...parsed.data, now: new Date() }),
    }));
    if (outcome.status === "invalid") {
      return {
        status: "invalid",
        message: t("staged.stillInvalid", { count: outcome.problems.length }),
        warnings: [],
        problems: outcome.problems,
      };
    }

    // The dialog does not send the details of a review yet, so a file cannot be
    // blocked from here: it is reported as a failure rather than shown as done.
    if (outcome.status === "blocked") {
      return fail(translate(messageRef("importFailed")));
    }

    revalidateLedger();
    await flashSuccess("importDone", {
      imported: outcome.newCount,
      duplicates: outcome.duplicateCount,
    });
    const warnings = outcome.ceilingWarnings
      .slice(0, WARNING_COUNT)
      .map((warning) =>
        t("ceilingWarning", {
          label: warning.label,
          date: formatCalendarDate(warning.date, locale),
          excess: formatAmount(warning.excess, currency, locale),
        }),
      );
    if (outcome.accountArchived) warnings.push(t("archivedWarning"));
    return {
      status: "done",
      message:
        outcome.newCount === 0
          ? t("nothingToImport")
          : t("imported", {
              imported: outcome.newCount,
              duplicates: outcome.duplicateCount,
            }),
      warnings,
      problems: [],
    };
  } catch (error) {
    if (error instanceof AccountNotFoundError) {
      return fail(translate({ key: "accountGone" }));
    }
    // Unexpected failures are logged with their detail, the user sees a generic message.
    console.error("Staged import failed", error);
    const ref = messageRef("importFailed");
    await flashError(ref);
    return fail(translate(ref));
  }
}
