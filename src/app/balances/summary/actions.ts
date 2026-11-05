"use server";

import { revalidatePath } from "next/cache";
import { getLocale, getTimeZone, getTranslations } from "next-intl/server";

import { BalanceAssertionValidationError } from "../../../domain/balance-assertion";
import { messageRef } from "../../../domain/message";
import { readSheetSummary, readSummaryBalances } from "../../../domain/sheet-summary";
import { lastCompleteMonth } from "../../../domain/synthesis";
import { todayIn } from "../../../i18n/dates";
import { AccountNotFoundError, listAccounts } from "../../../ledger/accounts";
import { BalanceAssertionOnArchivedAccountError } from "../../../ledger/balance-assertions";
import { compareStoredHistoryWithSummary } from "../../../ledger/summary-comparison";
import {
  previewSummaryAssertions,
  saveSummaryAssertions,
} from "../../../ledger/summary-assertions";
import { withDatabase } from "../../../storage/with-database";
import { requireSession } from "../../auth/session";
import { flashError, flashSuccess } from "../../feedback/flash";
import { decodeImportFile } from "../../imports/import-form-data";
import { getTranslator } from "../../translator";
import { readSummaryBalancesForm } from "./summary-balances-form-data";
import {
  buildSummaryBalancesState,
  type SummaryBalancesContext,
  type SummaryBalancesState,
} from "./summary-balances-state";

const BALANCES_PATH = "/balances";

const NO_DETAILS = {
  errorField: null,
  notes: [],
  rows: [],
  differences: [],
  isMatching: false,
  hasComparison: false,
  canCommit: false,
} as const satisfies Partial<SummaryBalancesState>;

export async function summaryBalancesAction(
  _previous: SummaryBalancesState | null,
  formData: FormData,
): Promise<SummaryBalancesState> {
  await requireSession();
  const [t, translate, locale, timeZone] = await Promise.all([
    getTranslations("summaryBalances"),
    getTranslator(),
    getLocale(),
    getTimeZone(),
  ]);
  const fail = (
    message: string,
    errorField: SummaryBalancesState["errorField"] = null,
  ): SummaryBalancesState => ({
    ...NO_DETAILS,
    status: "error",
    message,
    errorField,
  });

  const accounts = withDatabase((db) => listAccounts(db));
  const reading = readSummaryBalancesForm(formData, accounts);
  if ("error" in reading) {
    return fail(
      t(`errors.${reading.error.key}`, reading.error.values),
      reading.error.field,
    );
  }
  const { form } = reading;
  const account = accounts.find(({ id }) => id === form.accountId);
  if (account === undefined) return fail(t("errors.accountRequired"), "accountId");

  const context: SummaryBalancesContext = {
    say: {
      t: (key, values) => t(key, values),
      translate,
      locale,
      currency: account.currency,
    },
    phase: "preview",
  };
  const today = todayIn(timeZone, new Date());

  try {
    const text = decodeImportFile(await form.file.arrayBuffer());
    const options = { currency: account.currency, year: form.year };
    const { balances, issues } = readSummaryBalances(text, options);
    const { months } = readSheetSummary(text, options);

    const summary = withDatabase((db) => ({
      source: form.file.name,
      issues,
      balances,
      preview: previewSummaryAssertions(db, account.id, balances, today),
      comparison: compareStoredHistoryWithSummary(db, months, {
        referenceCurrency: account.currency,
        lastCompleteMonth: lastCompleteMonth(today),
      }),
    }));
    const shown = buildSummaryBalancesState(summary, context);
    if (!form.isCommit || !shown.canCommit) return shown;

    const { saved } = withDatabase((db) =>
      saveSummaryAssertions(db, account.id, balances, today),
    );
    revalidatePath(BALANCES_PATH);
    revalidatePath(`/accounts/${account.id}/balances`);
    await flashSuccess("summaryBalancesSaved", { count: saved.length });
    return buildSummaryBalancesState(summary, { ...context, phase: "done" });
  } catch (error) {
    if (error instanceof AccountNotFoundError) return fail(t("errors.accountGone"));
    if (error instanceof BalanceAssertionOnArchivedAccountError) {
      return fail(translate(messageRef("balanceAssertionOnArchivedAccount")));
    }
    if (error instanceof BalanceAssertionValidationError) {
      return fail(translate(error.ref));
    }
    // Unexpected failures are logged with their detail, the user sees a generic message.
    console.error("Summary balances action failed", error);
    const ref = messageRef("summaryBalancesNotSaved");
    await flashError(ref);
    return fail(translate(ref));
  }
}
