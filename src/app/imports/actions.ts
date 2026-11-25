"use server";

import { getTranslations } from "next-intl/server";

import { ImportParseError } from "../../domain/import-row";
import { messageRef } from "../../domain/message";
import { AccountNotFoundError, getAccount } from "../../ledger/accounts";
import { withDatabase } from "../../storage/with-database";
import { requireSession } from "../auth/session";
import { flashError } from "../feedback/flash";
import { getTranslator } from "../translator";
import {
  decodeImportFile,
  detectImportFormat,
  MAX_IMPORT_FILE_BYTES,
  type ImportFormState,
} from "./import-form-data";
import { readCsv } from "./read-statement";

const BYTES_PER_MEGABYTE = 1024 * 1024;

/**
 * Reads a lone CSV file whose columns were not found, for the mapping form:
 * its first rows and the fields to start from. Records nothing: once mapped,
 * the file is read again and goes through the review like any other (ADR-016).
 */
export async function readMappingAction(
  _previous: ImportFormState | null,
  formData: FormData,
): Promise<ImportFormState> {
  await requireSession();
  const [t, translate] = await Promise.all([
    getTranslations("imports"),
    getTranslator(),
  ]);
  const accountText = String(formData.get("accountId") ?? "");
  const fail = (message: string): ImportFormState => ({
    status: "error",
    message,
    accountId: accountText,
    mapping: null,
    rawRows: [],
  });

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
    // An OFX statement has no columns to map: the review reads it.
    if (detectImportFormat(text) === "ofx") {
      return fail(translate(messageRef("importFailed")));
    }
    const { mapping, rawRows } = readCsv(text, null, accountId, account.currency);
    return {
      status: "mapping",
      message: t("mappingNeeded"),
      accountId: accountText,
      mapping,
      rawRows,
    };
  } catch (error) {
    if (error instanceof ImportParseError) {
      const message = translate(error.ref);
      return fail(
        error.line === null
          ? message
          : t("problemAtLine", { line: error.line, message }),
      );
    }
    if (error instanceof AccountNotFoundError)
      return fail(translate({ key: "accountGone" }));
    // Unexpected failures are logged with their detail, the user sees a generic message.
    console.error("Reading the file for its mapping failed", error);
    const ref = messageRef("importFailed");
    await flashError(ref);
    return fail(translate(ref));
  }
}
