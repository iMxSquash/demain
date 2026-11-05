import { isCalendarDate } from "../../domain/account";
import { CSV_DELIMITERS, type CsvDelimiter } from "../../domain/import-csv";
import { MoneyParseError, parseAmount } from "../../domain/money";
import { BYTES_PER_KILOBYTE, isChosenFile, MAX_FILE_BYTES } from "../form-files";
import type { MigrationKey } from "./describe-issues";

/** Monthly tabs accepted at once. */
export const MAX_TAB_FILES = 24;

const YEAR_PATTERN = /^\d{4}$/;
const ACCOUNT_ID_PATTERN = /^\d{1,9}$/;

export interface MigrationAccount {
  id: number;
  name: string;
  currency: string;
}

export type FormErrorKey = Extract<MigrationKey, `errors.${string}`>;

export interface FormError {
  key: FormErrorKey;
  values?: Record<string, string | number>;
}

export interface MigrationForm {
  tabs: File[];
  summary: File | null;
  year: number | undefined;
  delimiter: CsvDelimiter | undefined;
  checkingId: number;
  savingsId: number;
  openingDate: string;
  /** Only the balances the user filled in. */
  openingBalances: { accountId: number; amount: number }[];
  isCommit: boolean;
  hasConfirmed: boolean;
}

export type MigrationFormReading = { form: MigrationForm } | { error: FormError };

const refuse = (
  key: FormErrorKey,
  values?: FormError["values"],
): { error: FormError } => ({
  error: values === undefined ? { key } : { key, values },
});

function textOf(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function readAccountId(
  formData: FormData,
  name: string,
  accounts: readonly MigrationAccount[],
): number | null {
  const text = textOf(formData, name);
  if (!ACCOUNT_ID_PATTERN.test(text)) return null;
  const id = Number(text);
  return accounts.some((account) => account.id === id) ? id : null;
}

function checkFile(file: File): { error: FormError } | null {
  if (file.size === 0) return refuse("errors.fileEmpty", { name: file.name });
  if (file.size > MAX_FILE_BYTES) {
    return refuse("errors.fileTooLarge", {
      name: file.name,
      max: MAX_FILE_BYTES / BYTES_PER_KILOBYTE,
    });
  }
  return null;
}

function readBalances(
  formData: FormData,
  accounts: readonly MigrationAccount[],
): MigrationForm["openingBalances"] | { error: FormError } {
  const balances: MigrationForm["openingBalances"] = [];
  for (const account of accounts) {
    const text = textOf(formData, `balance-${account.id}`);
    if (text === "") continue;
    try {
      balances.push({
        accountId: account.id,
        amount: parseAmount(text, account.currency),
      });
    } catch (error) {
      if (!(error instanceof MoneyParseError)) throw error;
      return refuse("errors.balanceInvalid", { account: account.name });
    }
  }
  return balances;
}

/**
 * What the migration form holds, or the first thing that refuses it. Nothing
 * reads the files yet: this only checks what can be checked without opening them.
 */
export function readMigrationForm(
  formData: FormData,
  accounts: readonly MigrationAccount[],
): MigrationFormReading {
  const checkingId = readAccountId(formData, "checkingId", accounts);
  const savingsId = readAccountId(formData, "savingsId", accounts);
  if (checkingId === null || savingsId === null) {
    return refuse("errors.accountRequired");
  }
  if (checkingId === savingsId) return refuse("errors.sameAccount");

  const tabs = formData.getAll("tabs").filter(isChosenFile);
  if (tabs.length === 0) return refuse("errors.filesRequired");
  if (tabs.length > MAX_TAB_FILES) {
    return refuse("errors.tooManyFiles", { max: MAX_TAB_FILES });
  }
  const summaryEntry = formData.get("summary");
  const summary = summaryEntry !== null && isChosenFile(summaryEntry) ? summaryEntry : null;
  const files = summary === null ? tabs : [...tabs, summary];
  for (const file of files) {
    const problem = checkFile(file);
    if (problem !== null) return problem;
  }
  // The name is the source of every row: two files of one name would be mixed up.
  const names = new Set<string>();
  for (const { name } of files) {
    if (names.has(name)) return refuse("errors.duplicateFileName", { name });
    names.add(name);
  }

  const yearText = textOf(formData, "year");
  if (yearText !== "" && !YEAR_PATTERN.test(yearText)) {
    return refuse("errors.yearInvalid");
  }

  const openingDate = textOf(formData, "openingDate");
  if (!isCalendarDate(openingDate)) return refuse("errors.openingDateInvalid");

  const openingBalances = readBalances(formData, accounts);
  if ("error" in openingBalances) return openingBalances;

  return {
    form: {
      tabs,
      summary,
      year: yearText === "" ? undefined : Number(yearText),
      delimiter: CSV_DELIMITERS.find((delimiter) => delimiter === formData.get("delimiter")),
      checkingId,
      savingsId,
      openingDate,
      openingBalances,
      isCommit: textOf(formData, "intent") === "commit",
      hasConfirmed: textOf(formData, "confirmReview") === "on",
    },
  };
}

export interface PlannedSplit {
  location: string;
  date: string;
  amount: string;
  /** The accounts that receive the row, with what each receives. */
  parts: string;
}

export interface DifferenceRow {
  month: string;
  figure: string;
  sheet: string;
  demain: string;
  difference: string;
}

/** What the screen shows, already translated and formatted: it crosses to the browser as is. */
export interface MigrationFormState {
  status: "error" | "preview" | "done";
  /** The headline: the error, or what the preview and the migration found. */
  message: string;
  /** Translated, the first ones: each one stops the migration. */
  blocking: string[];
  /** Translated, the first ones: to read before confirming. */
  review: string[];
  plan: string[];
  splits: PlannedSplit[];
  differences: DifferenceRow[];
  /** A Summary was given and every month matches it to the cent. */
  isMatching: boolean;
  canCommit: boolean;
  /** There are points to read or differences: the user ticks a box before migrating. */
  needsConfirmation: boolean;
}

export const NO_DETAILS = {
  blocking: [],
  review: [],
  plan: [],
  splits: [],
  differences: [],
  isMatching: false,
  canCommit: false,
  needsConfirmation: false,
} as const satisfies Partial<MigrationFormState>;
