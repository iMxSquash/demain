import type en from "../../../../messages/en.json";
import { formatMonth } from "../../../i18n/dates";
import type { Translate } from "../../../domain/message";
import type { SummaryIssue } from "../../../domain/sheet-summary";
import type {
  VerificationIssue,
  VerifiedFigure,
} from "../../../domain/sheet-verification";

type Flatten<T, Prefix extends string = ""> = {
  [Key in keyof T & string]: T[Key] extends string
    ? `${Prefix}${Key}`
    : Flatten<T[Key], `${Prefix}${Key}.`>;
}[keyof T & string];

/** Keys of the Summary balances messages, checked against the reference translation file. */
export type SummaryKey = Flatten<(typeof en)["summaryBalances"]>;

type Values = Record<string, string | number>;

/** What the descriptions need to speak the language and the currency of the request. */
export interface Say {
  t: (key: SummaryKey, values?: Values) => string;
  /** Translates the messages raised by the domain. */
  translate: Translate;
  locale: string;
  currency: string;
}

function assertNever(value: never): never {
  throw new Error(`Unhandled issue: ${JSON.stringify(value)}`);
}

/** The columns of a file are numbered from 1, as in a spreadsheet. */
const columnNumbers = (columns: readonly number[]): string =>
  columns.map((column) => column + 1).join(", ");

function located(
  say: Say,
  source: string,
  line: number | null,
  text: string,
): string {
  const location =
    line === null
      ? say.t("locationFile", { source })
      : say.t("location", { source, line });
  return say.t("withLocation", { location, text });
}

/** The sentence for a problem of the Summary file: all of them are to be read, none blocks. */
export function describeSummaryIssue(
  source: string,
  issue: SummaryIssue,
  say: Say,
): string {
  const { t } = say;
  const file = (text: string) => located(say, source, null, text);
  const row = (line: number, text: string) => located(say, source, line, text);

  switch (issue.kind) {
    case "emptyFile":
      return file(t("issues.emptyFile"));
    case "delimiterNotFound":
      return file(t("issues.delimiterNotFound"));
    case "unreadableFile":
      return located(
        say,
        source,
        issue.line,
        t("issues.unreadableFile", { message: say.translate(issue.ref) }),
      );
    case "columnNotFound":
      return file(t(`issues.columnNotFound.${issue.column}`));
    case "unrecognizedColumn":
      return file(
        t("issues.columnUnrecognized", {
          column: issue.column + 1,
          header: issue.header,
        }),
      );
    case "ambiguousColumn": {
      const [first = 0, ...others] = issue.columns;
      return file(
        t(`issues.columnAmbiguous.${issue.column}`, {
          first: first + 1,
          others: columnNumbers(others),
        }),
      );
    }
    case "monthUnreadable":
      return row(issue.line, t("issues.monthUnreadable", { text: issue.text }));
    case "monthYearMissing":
      return row(issue.line, t("issues.monthYearMissing", { text: issue.text }));
    case "amountUnreadable":
      return row(issue.line, t("issues.amountUnreadable", { text: issue.text }));
    default:
      return assertNever(issue);
  }
}

export function figureLabel(figure: VerifiedFigure, say: Say): string {
  return say.t(`figures.${figure}`);
}

export function describeVerificationIssue(
  issue: VerificationIssue,
  say: Say,
): string {
  const { t } = say;
  const month = formatMonth(issue.month, say.locale);

  switch (issue.kind) {
    case "monthMissingInSheet":
      return t("issues.monthMissingInSheet", { month });
    case "monthMissingInDemain":
      return t("issues.monthMissingInDemain", { month });
    case "duplicateSheetMonth":
      return t("issues.duplicateSheetMonth", { month });
    case "figureMissingInSheet":
      return t("issues.figureMissingInSheet", {
        month,
        figure: figureLabel(issue.figure, say),
      });
    default:
      return assertNever(issue);
  }
}
