import { MAX_YEAR, MIN_YEAR, MONTHS_IN_YEAR } from "../../../domain/calendar-date";
import type { AccountKind } from "../../../domain/account";

export const CHECKING_KEY = "checking";

type SearchParam = string | string[] | undefined;

const MONTH_PATTERN = /^(\d{4})-(\d{2})$/;
const ACCOUNT_ID_PATTERN = /^[1-9]\d{0,14}$/;

/** A strict `YYYY-MM`, the current month for anything else (a missing, repeated or invalid value). */
export function parseMonthParam(value: SearchParam, currentMonth: string): string {
  if (typeof value !== "string") return currentMonth;
  const match = MONTH_PATTERN.exec(value);
  if (match === null) return currentMonth;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const isValid = year >= MIN_YEAR && year <= MAX_YEAR && month >= 1 && month <= MONTHS_IN_YEAR;
  return isValid ? value : currentMonth;
}

/** "checking" or the digits of an account id; a value that is neither is "checking". */
export function parseAccountParam(value: SearchParam): string {
  return typeof value === "string" && ACCOUNT_ID_PATTERN.test(value) ? value : CHECKING_KEY;
}

export interface SelectableAccount {
  id: number;
  name: string;
  kind: AccountKind;
  currency: string;
}

export interface AccountSelection {
  key: string;
  accountIds: number[];
  currency: string;
}

/**
 * The accounts behind the selector value. `accounts` are the active ones. A key that names no
 * active account is the checking accounts, summed in the reference currency.
 */
export function selectAccounts(
  key: string,
  accounts: readonly SelectableAccount[],
  referenceCurrency: string,
): AccountSelection {
  const single = accounts.find((account) => String(account.id) === key);
  if (single !== undefined) return { key, accountIds: [single.id], currency: single.currency };
  return {
    key: CHECKING_KEY,
    accountIds: accounts.filter((account) => account.kind === "checking").map((account) => account.id),
    currency: referenceCurrency,
  };
}
