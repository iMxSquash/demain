import type en from "../../../messages/en.json";
import { formatAmount } from "../../domain/money";
import type { AssertionLink, AssertionLinks } from "../../domain/import-assertions";
import { formatCalendarDate } from "../../i18n/dates";
import type { Flatten } from "./describe-issues";

/** Keys of the messages about the assertions of a file, checked against the reference translation file. */
export type AssertionLinkKey = Flatten<(typeof en)["imports"]["staged"]["assertionLinks"]>;

export type AssertionLinkT = (
  key: AssertionLinkKey,
  values?: Record<string, string | number>,
) => string;

export interface AssertionLinkSay {
  t: AssertionLinkT;
  currency: string;
  locale: string;
  nameOf: (accountId: number) => string;
}

export interface AssertionLinkRowView {
  /** The id of the assertion. */
  key: number;
  accountName: string;
  date: string;
  realBalance: string;
  computedBalance: string;
  /** Always words: the amount alone, or its color, never says who holds more. */
  gap: string;
}

export interface AssertionLinksView {
  /** Null when no assertion falls in the period of the file. */
  summary: string | null;
  rows: AssertionLinkRowView[];
}

function describeGap(
  { gap, direction }: AssertionLink,
  { t, currency, locale }: AssertionLinkSay,
): string {
  if (direction === "equal") return t("gapNone");
  const amount = `${gap > 0 ? "+" : ""}${formatAmount(gap, currency, locale)}`;
  return t(direction === "realBelow" ? "gapDemainHigher" : "gapBankHigher", { amount });
}

/** The texts of the assertions of a file, from the figures of the domain: nothing is summed here. */
export function describeAssertionLinks(
  { accounts, checked, matching }: AssertionLinks,
  say: AssertionLinkSay,
): AssertionLinksView {
  const { t, currency, locale, nameOf } = say;
  if (checked === 0) return { summary: null, rows: [] };
  return {
    // No ICU plural: the repository words each count with its own keys.
    summary: t(checked === 1 ? "summaryOne" : "summary", { matching, checked }),
    rows: accounts.flatMap(({ accountId, links }) =>
      links.map((link) => ({
        key: link.assertionId,
        accountName: nameOf(accountId),
        date: formatCalendarDate(link.date, locale),
        realBalance: formatAmount(link.realBalance, currency, locale),
        computedBalance: formatAmount(link.computedBalance, currency, locale),
        gap: describeGap(link, say),
      })),
    ),
  };
}
