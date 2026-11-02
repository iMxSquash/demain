import type en from "../../../messages/en.json";
import type { Translate } from "../../domain/message";
import { formatAmount } from "../../domain/money";
import { formatCalendarDate } from "../../i18n/dates";
import type { ImportIssue } from "../../ledger/imports";

type Flatten<T, Prefix extends string = ""> = {
  [Key in keyof T & string]: T[Key] extends string
    ? `${Prefix}${Key}`
    : Flatten<T[Key], `${Prefix}${Key}.`>;
}[keyof T & string];

/** Keys of the messages about a blocked file, checked against the reference translation file. */
export type ImportIssueKey = Flatten<(typeof en)["imports"]["staged"]["issues"]>;

/** What the descriptions need to speak the language and the currency of the request. */
export interface ImportSay {
  t: (key: ImportIssueKey, values?: Record<string, string | number>) => string;
  /** Translates the messages raised by the ledger. */
  translate: Translate;
  locale: string;
  currency: string;
  /** The rows of the file in the order the issues number them. */
  rows: readonly { label: string; date: string }[];
}

export interface ReportedImportIssue {
  /** Position of the row in the file; null for an issue that concerns no row. */
  index: number | null;
  /** Translated. */
  message: string;
}

function assertNever(value: never): never {
  throw new Error(`Unhandled issue: ${JSON.stringify(value)}`);
}

function ofRow(say: ImportSay, index: number, text: string): ReportedImportIssue {
  const row = say.rows[index];
  if (row === undefined) return { index, message: text };
  return {
    index,
    message: say.t("withRow", {
      label: row.label,
      date: formatCalendarDate(row.date, say.locale),
      text,
    }),
  };
}

/** Everything the ledger reports stops the file: it is recorded whole or not at all. */
export function describeImportIssue(
  issue: ImportIssue,
  say: ImportSay,
): ReportedImportIssue {
  const { t } = say;

  switch (issue.kind) {
    case "savingsAmountInvalid":
      return ofRow(say, issue.index, t("savingsAmountInvalid"));
    case "savingsUnplaced":
      return ofRow(
        say,
        issue.index,
        t("savingsUnplaced", {
          amount: formatAmount(issue.amount, say.currency, say.locale),
        }),
      );
    case "overflowChainCycle":
      return { index: null, message: t("overflowChainCycle") };
    case "rowProblem":
      return ofRow(say, issue.index, t(`rowProblem.${issue.problem}`));
    case "rowInvalid":
      return ofRow(say, issue.index, say.translate(issue.ref));
    default:
      return assertNever(issue);
  }
}
