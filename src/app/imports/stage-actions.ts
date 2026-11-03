"use server";

import { getLocale, getTranslations } from "next-intl/server";

import { amountTextForType, readImportDraft } from "../../domain/import-draft";
import { ImportParseError } from "../../domain/import-row";
import { firstMovementDate } from "../../domain/import-savings";
import type { TypedStagedRow } from "../../domain/import-staging";
import { messageRef } from "../../domain/message";
import { formatAmount } from "../../domain/money";
import { formatCalendarDate } from "../../i18n/dates";
import { AccountNotFoundError, getAccount } from "../../ledger/accounts";
import { listCategories } from "../../ledger/categories";
import { findDuplicateRows, type ImportFormat } from "../../ledger/imports";
import { commitDrafts } from "../../ledger/staged-import";
import { withDatabase } from "../../storage/with-database";
import { requireSession } from "../auth/session";
import { flashError, flashSuccess } from "../feedback/flash";
import { revalidateLedger } from "../revalidate-ledger";
import { getTranslator } from "../translator";
import {
  commitRequestSchema,
  MAX_FILE_NAME_LENGTH,
  type CommitStagedRequest,
} from "./commit-request";
import { describeImportIssue } from "./describe-issues";
import {
  decodeImportFile,
  detectImportFormat,
  failedStagedFile,
  readColumnChoices,
  MAX_IMPORT_FILE_BYTES,
  type CommitStagedState,
  type StagedFile,
} from "./import-form-data";
import { stageStatement } from "./stage-statement";

const WARNING_COUNT = 20;
const BYTES_PER_MEGABYTE = 1024 * 1024;

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
  const failed = (
    message: string,
    options?: { needsMapping?: boolean },
  ): StagedFile => failedStagedFile(fileName, message, options);

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
    const { currency, categories } = withDatabase((db) => ({
      currency: getAccount(db, accountId).currency,
      categories: listCategories(db),
    }));
    const text = decodeImportFile(await file.arrayBuffer());
    const format: ImportFormat = detectImportFormat(text);

    const statement = stageStatement(text, format, {
      fileName,
      accountId,
      currency,
      categories,
      columns: readColumnChoices(formData),
    });
    if (statement.status === "mappingNeeded") {
      return failed(t("staged.mappingNeeded"), { needsMapping: true });
    }
    if (statement.status === "yearMissing") {
      return failed(t("staged.yearMissing"));
    }

    const isDuplicate = duplicateFlags(accountId, statement.rows, currency);
    return {
      fileName,
      status: "ready",
      message: "",
      format: statement.format,
      mapping: statement.mapping,
      currency,
      firstDate: firstMovementDate(statement.rows.map((row) => row.draft.date)),
      needsMapping: false,
      columns: statement.columns,
      rows: statement.rows.map((row, index) => ({
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
  staged: readonly TypedStagedRow[],
  currency: string,
): boolean[] {
  // Compared on the amount the review shows and the import records.
  const readings = staged.map(({ draft, details }) =>
    readImportDraft(
      { ...draft, amount: amountTextForType(draft.amount, details.type, currency) },
      currency,
    ),
  );
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
  const [t, issuesT, translate, locale] = await Promise.all([
    getTranslations("imports"),
    getTranslations("imports.staged.issues"),
    getTranslator(),
    getLocale(),
  ]);
  const fail = (message: string): CommitStagedState => ({
    status: "error",
    message,
    warnings: [],
    problems: [],
    issues: [],
  });

  const parsed = commitRequestSchema.safeParse(request);
  if (!parsed.success) return fail(translate(messageRef("importFailed")));
  const { savingsAccountId, ...file } = parsed.data;

  try {
    const { currency, outcome } = withDatabase((db) => ({
      currency: getAccount(db, file.accountId).currency,
      outcome: commitDrafts(db, {
        ...file,
        savingsAccountId: savingsAccountId ?? undefined,
        now: new Date(),
      }),
    }));
    if (outcome.status === "invalid") {
      return {
        status: "invalid",
        message: t("staged.stillInvalid", { count: outcome.problems.length }),
        warnings: [],
        problems: outcome.problems,
        issues: [],
      };
    }

    if (outcome.status === "blocked") {
      const say = {
        t: issuesT,
        translate,
        locale,
        currency,
        rows: file.drafts,
      };
      return {
        status: "blocked",
        message: t("staged.blocked"),
        warnings: [],
        problems: [],
        issues: outcome.issues.map((issue) => describeImportIssue(issue, say)),
      };
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
      issues: [],
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
