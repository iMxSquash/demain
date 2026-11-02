import type en from "../../../messages/en.json";
import type { Translate } from "../../domain/message";
import { formatAmount } from "../../domain/money";
import type { SheetTabIssue } from "../../domain/sheet-tab";
import type { SummaryIssue } from "../../domain/sheet-summary";
import type {
  VerificationIssue,
  VerifiedFigure,
} from "../../domain/sheet-verification";
import { formatMonth } from "../../i18n/dates";
import type {
  MigrationIssue,
  MigrationNotice,
} from "../../ledger/sheet-migration";

type Flatten<T, Prefix extends string = ""> = {
  [Key in keyof T & string]: T[Key] extends string
    ? `${Prefix}${Key}`
    : Flatten<T[Key], `${Prefix}${Key}.`>;
}[keyof T & string];

/** Keys of the migration messages, checked against the reference translation file. */
export type MigrationKey = Flatten<(typeof en)["migration"]>;

type Values = Record<string, string | number>;

/** What the descriptions need to speak the language and the currency of the request. */
export interface Say {
  t: (key: MigrationKey, values?: Values) => string;
  /** Translates the messages raised by the domain. */
  translate: Translate;
  locale: string;
  currency: string;
  accountName: (id: number) => string;
}

/** A line of the report: a blocking one must be fixed, any other is to be read. */
export interface ReportedIssue {
  isBlocking: boolean;
  text: string;
}

// Lines and columns are listed in full up to this many, then cut.
const LISTED_ITEMS = 5;

function assertNever(value: never): never {
  throw new Error(`Unhandled issue: ${JSON.stringify(value)}`);
}

function listOf(items: readonly (string | number)[]): string {
  const shown = items.slice(0, LISTED_ITEMS).join(", ");
  return items.length > LISTED_ITEMS ? `${shown}, …` : shown;
}

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

const blocking = (text: string): ReportedIssue => ({ isBlocking: true, text });
const toReview = (text: string): ReportedIssue => ({ isBlocking: false, text });

// One amount written each way, to show how the amounts of a file were read.
const NUMBER_FORMAT_EXAMPLES = { ",": "1 234,56", ".": "1,234.56" } as const;

/** The columns of a file are numbered from 1, as in a spreadsheet. */
const columnNumbers = (columns: readonly number[]): string =>
  listOf(columns.map((column) => column + 1));

export function describeTabIssue(
  source: string,
  issue: SheetTabIssue,
  say: Say,
): ReportedIssue {
  const { t } = say;
  const file = (text: string) => located(say, source, null, text);
  const row = (line: number, text: string) => located(say, source, line, text);

  switch (issue.kind) {
    case "emptyFile":
      return blocking(file(t("issues.emptyFile")));
    case "delimiterNotFound":
      return blocking(file(t("issues.delimiterNotFound")));
    case "unreadableFile":
      return blocking(
        located(
          say,
          source,
          issue.line,
          t("issues.unreadableFile", { message: say.translate(issue.ref) }),
        ),
      );
    case "mappingColumnNotFound":
      return blocking(file(t(`issues.mappingColumnNotFound.${issue.role}`)));
    case "dateFormatNotFound":
      return blocking(file(t("issues.dateFormatNotFound")));
    case "dateFormatAmbiguous":
      return toReview(file(t(`issues.dateFormatAmbiguous.${issue.format}`)));
    case "dateYearMissing":
      return blocking(file(t("issues.dateYearMissing")));
    case "dateYearAssumed":
      return toReview(file(t("issues.dateYearAssumed", { year: issue.year })));
    case "columnNotFound":
      return toReview(file(t(`issues.columnNotFound.${issue.role}`)));
    case "ambiguousColumn":
      return toReview(
        file(
          t(`issues.ambiguousColumn.${issue.role}`, {
            column: issue.column + 1,
            others: columnNumbers(issue.alsoMatching),
          }),
        ),
      );
    case "unrecognizedValue":
      return toReview(
        file(
          t(`issues.unrecognizedValue.${issue.role}`, {
            value: issue.value,
            lines: listOf(issue.lines),
          }),
        ),
      );
    case "columnsIgnored":
      return toReview(
        file(t("issues.columnsIgnored", { columns: columnNumbers(issue.columns) })),
      );
    case "rowsIgnored":
      return toReview(
        file(t(`issues.rowsIgnored.${issue.reason}`, { lines: listOf(issue.lines) })),
      );
    case "numberFormatAmbiguous":
      return toReview(
        file(
          t("issues.numberFormatAmbiguous", {
            example: NUMBER_FORMAT_EXAMPLES[issue.mark],
          }),
        ),
      );
    case "rowUnreadable":
      return blocking(
        row(
          issue.line,
          t("issues.rowUnreadable", { message: say.translate(issue.ref) }),
        ),
      );
    case "typeUnrecognized":
      return blocking(
        row(issue.line, t("issues.typeUnrecognized", { value: issue.value })),
      );
    case "typeMissing":
      return blocking(row(issue.line, t("issues.typeMissing")));
    case "labelFromCategory":
      return toReview(
        row(issue.line, t("issues.labelFromCategory", { category: issue.category })),
      );
    default:
      return assertNever(issue);
  }
}

/**
 * The Summary only checks the figures and gives the real balances: whatever
 * is wrong with it is to be read, and does not stop the history from being
 * recorded.
 */
export function describeSummaryIssue(
  source: string,
  issue: SummaryIssue,
  say: Say,
): ReportedIssue {
  const { t } = say;
  const file = (text: string) => located(say, source, null, text);
  const row = (line: number, text: string) => located(say, source, line, text);

  switch (issue.kind) {
    case "emptyFile":
      return toReview(file(t("issues.emptyFile")));
    case "delimiterNotFound":
      return toReview(file(t("issues.delimiterNotFound")));
    case "unreadableFile":
      return toReview(
        located(
          say,
          source,
          issue.line,
          t("issues.unreadableFile", { message: say.translate(issue.ref) }),
        ),
      );
    case "columnNotFound":
      return toReview(file(t(`issues.summaryColumnNotFound.${issue.column}`)));
    case "unrecognizedColumn":
      return toReview(
        file(
          t("issues.summaryColumnUnrecognized", {
            column: issue.column + 1,
            header: issue.header,
          }),
        ),
      );
    case "ambiguousColumn": {
      const [first = 0, ...others] = issue.columns;
      return toReview(
        file(
          t(`issues.summaryColumnAmbiguous.${issue.column}`, {
            first: first + 1,
            others: columnNumbers(others),
          }),
        ),
      );
    }
    case "monthUnreadable":
      return toReview(
        row(issue.line, t("issues.summaryMonthUnreadable", { text: issue.text })),
      );
    case "monthYearMissing":
      return toReview(
        row(issue.line, t("issues.summaryMonthYearMissing", { text: issue.text })),
      );
    case "amountUnreadable":
      return toReview(
        row(issue.line, t("issues.summaryAmountUnreadable", { text: issue.text })),
      );
    default:
      return assertNever(issue);
  }
}

/** Everything the ledger reports stops the migration. */
export function describeMigrationIssue(
  issue: MigrationIssue,
  say: Say,
): ReportedIssue {
  const { t } = say;

  switch (issue.kind) {
    case "savingsAmountInvalid":
      return blocking(
        located(say, issue.source, issue.line, t("issues.savingsAmountInvalid")),
      );
    case "savingsUnplaced":
      return blocking(
        located(
          say,
          issue.source,
          issue.line,
          t("issues.savingsUnplaced", {
            amount: formatAmount(issue.amount, say.currency, say.locale),
          }),
        ),
      );
    case "overflowChainCycle":
      return blocking(t("issues.overflowChainCycle"));
    case "accountArchived":
      return blocking(t("issues.accountArchived"));
    case "ledgerNotEmpty":
      return blocking(
        t("issues.ledgerNotEmpty", { account: say.accountName(issue.accountId) }),
      );
    case "categoryArchived":
      return blocking(
        t("issues.categoryArchived", {
          name: issue.name,
          rows: listOf(issue.rows.map((r) => `${r.source}:${r.line}`)),
        }),
      );
    case "rowInvalid":
      return blocking(
        located(
          say,
          issue.source,
          issue.line,
          t("issues.rowInvalid", { message: say.translate(issue.ref) }),
        ),
      );
    case "assertionInvalid":
      return blocking(
        t("issues.assertionInvalid", {
          month: formatMonth(issue.month, say.locale),
          message: say.translate(issue.ref),
        }),
      );
    default:
      return assertNever(issue);
  }
}

export function describeNotice(notice: MigrationNotice, say: Say): ReportedIssue {
  const { t } = say;

  switch (notice.kind) {
    case "assertionSkipped":
      return toReview(
        t("issues.assertionSkipped", {
          month: formatMonth(notice.month, say.locale),
        }),
      );
    case "ruleConflict":
      return toReview(
        t("issues.ruleConflict", {
          label: notice.label,
          categories: notice.categories.join(", "),
        }),
      );
    case "ruleExists":
      return toReview(t("issues.ruleExists", { label: notice.label }));
    case "summaryNotProvided":
      return toReview(t("issues.summaryNotProvided"));
    default:
      return assertNever(notice);
  }
}

export function describeVerificationIssue(
  issue: VerificationIssue,
  say: Say,
): ReportedIssue {
  const { t } = say;
  const month = formatMonth(issue.month, say.locale);

  switch (issue.kind) {
    case "monthMissingInSheet":
      return toReview(t("issues.monthMissingInSheet", { month }));
    case "monthMissingInDemain":
      return toReview(t("issues.monthMissingInDemain", { month }));
    case "duplicateSheetMonth":
      return toReview(t("issues.duplicateSheetMonth", { month }));
    case "figureMissingInSheet":
      return toReview(
        t("issues.figureMissingInSheet", {
          month,
          figure: figureLabel(issue.figure, say),
        }),
      );
    default:
      return assertNever(issue);
  }
}

export function figureLabel(figure: VerifiedFigure, say: Say): string {
  return say.t(`figures.${figure}`);
}

/** The months of the Summary that fall outside the imported period. */
export function describeIgnoredMonths(
  months: readonly string[],
  say: Say,
): ReportedIssue | null {
  if (months.length === 0) return null;
  return toReview(
    say.t("issues.summaryMonthsIgnored", {
      months: months.map((month) => formatMonth(month, say.locale)).join(", "),
    }),
  );
}
