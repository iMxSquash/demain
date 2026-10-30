"use server";

import { getLocale, getTranslations } from "next-intl/server";

import { messageRef } from "../../domain/message";
import { readSheetSummary, scopeSummary } from "../../domain/sheet-summary";
import { readSheetTab } from "../../domain/sheet-tab";
import { AccountNotFoundError, listAccounts } from "../../ledger/accounts";
import {
  commitSheetMigration,
  previewSheetMigration,
  SheetMigrationBlockedError,
  type SheetMigrationRequest,
} from "../../ledger/sheet-migration";
import { withDatabase } from "../../storage/with-database";
import { requireSession } from "../auth/session";
import { flashError, flashSuccess } from "../feedback/flash";
import { decodeImportFile } from "../imports/import-form-data";
import { revalidateLedger } from "../revalidate-ledger";
import { getTranslator } from "../translator";
import { buildPreviewState } from "./build-preview-state";
import type { Say } from "./describe-issues";
import {
  NO_DETAILS,
  readMigrationForm,
  type MigrationForm,
  type MigrationFormState,
} from "./migration-form-data";

async function textOf(file: File): Promise<string> {
  return decodeImportFile(await file.arrayBuffer());
}

export async function migrationAction(
  _previous: MigrationFormState | null,
  formData: FormData,
): Promise<MigrationFormState> {
  await requireSession();
  const [t, translate, locale] = await Promise.all([
    getTranslations("migration"),
    getTranslator(),
    getLocale(),
  ]);
  const fail = (message: string): MigrationFormState => ({
    ...NO_DETAILS,
    status: "error",
    message,
  });

  const accounts = withDatabase((db) => listAccounts(db));
  const reading = readMigrationForm(
    formData,
    accounts.map(({ id, name, currency }) => ({ id, name, currency })),
  );
  if ("error" in reading) {
    return fail(t(reading.error.key, reading.error.values));
  }
  const { form } = reading;
  const names = new Map(accounts.map((account) => [account.id, account.name]));
  const currency =
    accounts.find((account) => account.id === form.checkingId)?.currency ?? "";
  const say: Say = {
    t: (key, values) => t(key, values),
    translate,
    locale,
    currency,
    accountName: (id) => names.get(id) ?? String(id),
  };

  try {
    return await run(form, currency, say);
  } catch (error) {
    if (error instanceof AccountNotFoundError) {
      return fail(t("errors.accountGone"));
    }
    // Unexpected failures are logged with their detail, the user sees a generic message.
    console.error("Migration action failed", error);
    const ref = messageRef("migrationFailed");
    await flashError(ref);
    return fail(translate(ref));
  }
}

async function run(
  form: MigrationForm,
  currency: string,
  say: Say,
): Promise<MigrationFormState> {
  const options = { currency, year: form.year, delimiter: form.delimiter };
  const tabs = await Promise.all(
    form.tabs.map(async (file) =>
      readSheetTab(await textOf(file), { ...options, source: file.name }),
    ),
  );
  const rows = tabs.flatMap((tab) => tab.rows);
  const summary =
    form.summary === null
      ? null
      : {
          source: form.summary.name,
          reading: readSheetSummary(await textOf(form.summary), options),
        };
  const scope = scopeSummary(summary?.reading.months ?? [], rows);

  const request: SheetMigrationRequest = {
    rows,
    checkingId: form.checkingId,
    savingsDestinationId: form.savingsId,
    openingDate: form.openingDate,
    openingBalances: form.openingBalances,
    summary: scope.inScope,
  };
  const preview = withDatabase((db) => previewSheetMigration(db, request));
  const reading = {
    tabs,
    summary,
    ignoredSummaryMonths: scope.ignored,
    rows,
    preview,
  };
  const shown = buildPreviewState(reading, say);
  if (!form.isCommit || !shown.canCommit) return shown;

  // Reading the points to check is the user's decision, taken before anything is written.
  if (shown.needsConfirmation && !form.hasConfirmed) {
    return { ...shown, status: "error", message: say.t("errors.confirmRequired") };
  }

  try {
    const result = withDatabase((db) => commitSheetMigration(db, request));
    revalidateLedger();
    await flashSuccess("migrationDone", { count: result.transactionCount });
    return {
      ...shown,
      status: "done",
      message: say.t("messages.done", { count: result.transactionCount }),
      canCommit: false,
    };
  } catch (error) {
    // The ledger changed since the preview: show what now stops the migration.
    if (error instanceof SheetMigrationBlockedError) {
      return buildPreviewState(
        { ...reading, preview: { ...preview, issues: [...error.issues] } },
        say,
      );
    }
    throw error;
  }
}
