/**
 * Account rules. Pure functions: no database, no clock. See DOMAIN, entity Account.
 */

export const ACCOUNT_KINDS = ["checking", "savings", "other"] as const;

export type AccountKind = (typeof ACCOUNT_KINDS)[number];

export interface AccountInput {
  name: string;
  kind: string;
  currency: string;
  /** Calendar date, YYYY-MM-DD. */
  openingDate: string;
  /** Signed integer in minor units. */
  openingBalance: number;
  /** Maximum balance reachable through deposits, in minor units. */
  depositCeiling?: number | null;
  overflowAccountId?: number | null;
}

export interface ValidAccountInput extends AccountInput {
  kind: AccountKind;
}

export type AccountField =
  | "name"
  | "kind"
  | "currency"
  | "openingDate"
  | "openingBalance"
  | "depositCeiling"
  | "overflowAccountId";

export class AccountValidationError extends Error {
  constructor(
    readonly field: AccountField,
    message: string,
  ) {
    super(message);
    this.name = "AccountValidationError";
  }
}

// Intl carries the ISO 4217 codes, like the minor units in the money core.
const KNOWN_CURRENCIES: ReadonlySet<string> = new Set(
  Intl.supportedValuesOf("currency"),
);

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

// Date.UTC rolls an impossible day over to the next month, so a round trip
// that changes the day or the month reveals a date that does not exist.
export function isCalendarDate(value: string): boolean {
  const match = ISO_DATE.exec(value);
  if (match === null) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function isAccountKind(value: string): value is AccountKind {
  return (ACCOUNT_KINDS as readonly string[]).includes(value);
}

export function validateAccountInput(input: AccountInput): ValidAccountInput {
  const name = input.name.trim();
  if (name.length === 0) {
    throw new AccountValidationError("name", "The account name is required");
  }
  if (!isAccountKind(input.kind)) {
    throw new AccountValidationError(
      "kind",
      `Unknown account kind "${input.kind}"`,
    );
  }

  if (!KNOWN_CURRENCIES.has(input.currency)) {
    throw new AccountValidationError(
      "currency",
      `Unknown currency "${input.currency}", expected an ISO 4217 code such as EUR`,
    );
  }

  if (!Number.isSafeInteger(input.openingBalance)) {
    throw new AccountValidationError(
      "openingBalance",
      "The opening balance must be an integer in minor units",
    );
  }

  const { depositCeiling } = input;
  if (
    depositCeiling !== null &&
    depositCeiling !== undefined &&
    (!Number.isSafeInteger(depositCeiling) || depositCeiling < 0)
  ) {
    throw new AccountValidationError(
      "depositCeiling",
      "The deposit ceiling must be a non-negative integer in minor units",
    );
  }

  if (!isCalendarDate(input.openingDate)) {
    throw new AccountValidationError(
      "openingDate",
      `Invalid opening date "${input.openingDate}", expected YYYY-MM-DD`,
    );
  }

  return { ...input, name, kind: input.kind };
}

/**
 * The currency of an account is the currency of all its transactions, so it
 * can only change while the account has none (DOMAIN, entity Account).
 */
export function assertCurrencyChangeAllowed(
  currentCurrency: string,
  nextCurrency: string,
  { hasTransactions }: { hasTransactions: boolean },
): void {
  if (hasTransactions && nextCurrency !== currentCurrency) {
    throw new AccountValidationError(
      "currency",
      "The currency cannot change once the account has transactions",
    );
  }
}
