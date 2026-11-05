import {
  BYTES_PER_KILOBYTE,
  isChosenFile,
  MAX_FILE_BYTES,
} from "../../form-files";

const YEAR_PATTERN = /^\d{4}$/;
const ACCOUNT_ID_PATTERN = /^\d{1,9}$/;

export type SummaryFormErrorKey =
  | "fileRequired"
  | "fileTooLarge"
  | "fileEmpty"
  | "accountRequired"
  | "yearInvalid";

export type SummaryField = "summary" | "accountId" | "year";

const FIELD_OF_ERROR = {
  fileRequired: "summary",
  fileTooLarge: "summary",
  fileEmpty: "summary",
  accountRequired: "accountId",
  yearInvalid: "year",
} as const satisfies Record<SummaryFormErrorKey, SummaryField>;

export interface SummaryFormError {
  key: SummaryFormErrorKey;
  /** The control the error is about, so that it can be linked to it. */
  field: SummaryField;
  values?: Record<string, string | number>;
}

export interface SummaryBalancesForm {
  file: File;
  accountId: number;
  year: number | undefined;
  isCommit: boolean;
}

export type SummaryBalancesFormReading =
  | { form: SummaryBalancesForm }
  | { error: SummaryFormError };

const refuse = (
  key: SummaryFormErrorKey,
  values?: SummaryFormError["values"],
): { error: SummaryFormError } => ({
  error:
    values === undefined
      ? { key, field: FIELD_OF_ERROR[key] }
      : { key, field: FIELD_OF_ERROR[key], values },
});

function textOf(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

/**
 * What the form holds, or the first thing that refuses it. Nothing reads the
 * file yet: this only checks what can be checked without opening it.
 */
export function readSummaryBalancesForm(
  formData: FormData,
  accounts: readonly { id: number }[],
): SummaryBalancesFormReading {
  const accountText = textOf(formData, "accountId");
  const accountId = ACCOUNT_ID_PATTERN.test(accountText) ? Number(accountText) : null;
  if (accountId === null || !accounts.some((account) => account.id === accountId)) {
    return refuse("accountRequired");
  }

  const entry = formData.get("summary");
  if (entry === null || !isChosenFile(entry)) return refuse("fileRequired");
  if (entry.size === 0) return refuse("fileEmpty", { name: entry.name });
  if (entry.size > MAX_FILE_BYTES) {
    return refuse("fileTooLarge", {
      name: entry.name,
      max: MAX_FILE_BYTES / BYTES_PER_KILOBYTE,
    });
  }

  const yearText = textOf(formData, "year");
  if (yearText !== "" && !YEAR_PATTERN.test(yearText)) return refuse("yearInvalid");

  return {
    form: {
      file: entry,
      accountId,
      year: yearText === "" ? undefined : Number(yearText),
      isCommit: textOf(formData, "intent") === "commit",
    },
  };
}
