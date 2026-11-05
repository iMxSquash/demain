import { describe, expect, it } from "vitest";

import type {
  AssertedAccount,
  AssertionMovement,
  AssertionSnapshot,
} from "../../src/domain/balance-assertion";
import type { RowDetails } from "../../src/domain/import-draft";
import {
  fileMovements,
  filePeriod,
  linkAssertions,
  type FileContext,
} from "../../src/domain/import-assertions";
import {
  planReview,
  type ReviewedFile,
  type ReviewedRow,
} from "../../src/domain/import-review";
import type { OverflowAccount } from "../../src/domain/overflow";

const CHECKING_ID = 1;
const A_ID = 2;
const B_ID = 3;

const overflowAccount = (
  overrides: Partial<OverflowAccount> & { id: number },
): OverflowAccount => ({
  currency: "EUR",
  archived: false,
  balance: 0,
  ceiling: null,
  overflowAccountId: null,
  ...overrides,
});

// A has room for 100,00 and overflows to B, which has no ceiling.
const OVERFLOW_ACCOUNTS = [
  overflowAccount({ id: A_ID, balance: 90_000, ceiling: 100_000, overflowAccountId: B_ID }),
  overflowAccount({ id: B_ID, balance: 20_000 }),
];

const ASSERTED_ACCOUNTS: AssertedAccount[] = [
  { id: CHECKING_ID, openingBalance: 100_000 },
  { id: A_ID, openingBalance: 90_000 },
  { id: B_ID, openingBalance: 20_000 },
];

const CONTEXT: FileContext = {
  accountId: CHECKING_ID,
  currency: "EUR",
};
const DEFAULT_SAVINGS_ACCOUNT_ID = A_ID;

const EXPENSE: RowDetails = {
  type: "expense",
  categoryId: null,
  paymentMode: null,
  description: null,
  savingsAccountId: null,
};
const INCOME: RowDetails = { ...EXPENSE, type: "income" };
const SAVINGS: RowDetails = { ...EXPENSE, type: "savings" };

const row = (
  date: string,
  amount: string,
  details: RowDetails = EXPENSE,
  isDuplicate = false,
): ReviewedRow => ({
  draft: { date, label: "LABEL", amount, externalId: null },
  details,
  isDuplicate,
});

const file = (rows: ReviewedRow[], overrides: Partial<ReviewedFile> = {}): ReviewedFile => ({
  firstDate: "2026-03-01",
  phase: "reviewing",
  rows,
  ...overrides,
});

function movementsOf(reviewed: ReviewedFile): AssertionMovement[] {
  const [plan] = planReview([reviewed], {
    currency: CONTEXT.currency,
    defaultSavingsAccountId: DEFAULT_SAVINGS_ACCOUNT_ID,
    accounts: OVERFLOW_ACCOUNTS,
  });
  if (plan === undefined) throw new Error("planReview returned no plan");
  return fileMovements(reviewed, plan, CONTEXT);
}

describe("fileMovements", () => {
  it("signs the amount of an expense and of an income by their type", () => {
    expect(
      movementsOf(file([row("2026-03-02", "12,00"), row("2026-03-03", "-5,00", INCOME)])),
    ).toEqual([
      { accountId: CHECKING_ID, date: "2026-03-02", amount: -1_200 },
      { accountId: CHECKING_ID, date: "2026-03-03", amount: 500 },
    ]);
  });

  it("splits a savings deposit along the chain, on both sides of every part", () => {
    expect(movementsOf(file([row("2026-03-10", "-150,00", SAVINGS)]))).toEqual([
      { accountId: CHECKING_ID, date: "2026-03-10", amount: -10_000 },
      { accountId: A_ID, date: "2026-03-10", amount: 10_000 },
      { accountId: CHECKING_ID, date: "2026-03-10", amount: -5_000 },
      { accountId: B_ID, date: "2026-03-10", amount: 5_000 },
    ]);
  });

  it("takes a savings withdrawal from the savings account", () => {
    expect(movementsOf(file([row("2026-03-10", "40,00", SAVINGS)]))).toEqual([
      { accountId: CHECKING_ID, date: "2026-03-10", amount: 4_000 },
      { accountId: A_ID, date: "2026-03-10", amount: -4_000 },
    ]);
  });

  it("leaves out the rows the account already holds", () => {
    expect(
      movementsOf(
        file([
          row("2026-03-02", "-5,00", EXPENSE, true),
          row("2026-03-03", "-6,00", SAVINGS, true),
          row("2026-03-04", "-7,00"),
        ]),
      ),
    ).toEqual([{ accountId: CHECKING_ID, date: "2026-03-04", amount: -700 }]);
  });

  it("leaves out the rows that cannot be read", () => {
    expect(
      movementsOf(file([row("", "-5,00"), row("2026-03-04", "abc"), row("2026-03-05", "-7,00")])),
    ).toEqual([{ accountId: CHECKING_ID, date: "2026-03-05", amount: -700 }]);
  });

  it("records nothing of the part of a deposit that fits nowhere", () => {
    const [plan] = planReview([file([row("2026-03-10", "-150,00", SAVINGS)])], {
      currency: "EUR",
      defaultSavingsAccountId: A_ID,
      accounts: [
        overflowAccount({ id: A_ID, balance: 90_000, ceiling: 100_000 }),
        overflowAccount({ id: B_ID }),
      ],
    });
    expect(plan?.splits.get(0)?.map(({ direction }) => direction)).toEqual(["to", "unplaced"]);

    const movements = fileMovements(file([row("2026-03-10", "-150,00", SAVINGS)]), plan!, CONTEXT);

    expect(movements).toEqual([
      { accountId: CHECKING_ID, date: "2026-03-10", amount: -10_000 },
      { accountId: A_ID, date: "2026-03-10", amount: 10_000 },
    ]);
  });

  it.each(["cancelled", "failed"] as const)("gives nothing for a %s file", (phase) => {
    expect(movementsOf(file([row("2026-03-02", "-5,00")], { phase }))).toEqual([]);
  });
});

describe("filePeriod", () => {
  it("covers the first to the last date of the readable rows", () => {
    expect(
      filePeriod(
        file([row("2026-03-10", "-1,00"), row("", "-1,00"), row("2026-03-02", "-1,00")]),
        "EUR",
      ),
    ).toEqual({ from: "2026-03-02", to: "2026-03-10" });
  });

  it("counts the rows the account already holds: the file still covers their days", () => {
    expect(
      filePeriod(file([row("2026-03-02", "-1,00", EXPENSE, true)]), "EUR"),
    ).toEqual({ from: "2026-03-02", to: "2026-03-02" });
  });

  it("is a single day for a single row", () => {
    expect(filePeriod(file([row("2026-03-05", "-1,00")]), "EUR")).toEqual({
      from: "2026-03-05",
      to: "2026-03-05",
    });
  });

  it("is null for a file with no readable row", () => {
    expect(filePeriod(file([]), "EUR")).toBeNull();
    expect(filePeriod(file([row("", "-1,00")]), "EUR")).toBeNull();
  });

  it.each(["cancelled", "failed"] as const)("is null for a %s file", (phase) => {
    expect(filePeriod(file([row("2026-03-02", "-1,00")], { phase }), "EUR")).toBeNull();
  });
});

describe("linkAssertions", () => {
  const assertion = (
    id: number,
    accountId: number,
    date: string,
    amount: number,
  ): AssertionSnapshot => ({ id, accountId, date, amount });

  const link = (
    movements: AssertionMovement[],
    assertions: AssertionSnapshot[],
    options: {
      period?: { from: string; to: string } | null;
      accounts?: AssertedAccount[];
      transactions?: AssertionMovement[];
    } = {},
  ) =>
    linkAssertions(
      {
        accountId: CHECKING_ID,
        period: options.period === undefined ? { from: "2026-03-01", to: "2026-03-31" } : options.period,
        movements,
      },
      {
        accounts: options.accounts ?? ASSERTED_ACCOUNTS,
        transactions: options.transactions ?? [],
        assertions,
      },
    );

  const EXPENSE_MOVEMENT: AssertionMovement = {
    accountId: CHECKING_ID,
    date: "2026-03-10",
    amount: -2_500,
  };

  it("finds nothing to check when no assertion falls in the period", () => {
    expect(link([EXPENSE_MOVEMENT], [assertion(1, CHECKING_ID, "2026-04-01", 0)])).toEqual({
      accounts: [],
      checked: 0,
      matching: 0,
    });
  });

  it("finds nothing to check for a file with no period", () => {
    expect(
      link([], [assertion(1, CHECKING_ID, "2026-03-31", 0)], { period: null }),
    ).toEqual({ accounts: [], checked: 0, matching: 0 });
  });

  it("matches an assertion that equals the balance once the file is recorded", () => {
    const result = link([EXPENSE_MOVEMENT], [assertion(7, CHECKING_ID, "2026-03-31", 97_500)]);

    expect(result).toEqual({
      accounts: [
        {
          accountId: CHECKING_ID,
          links: [
            {
              assertionId: 7,
              date: "2026-03-31",
              realBalance: 97_500,
              computedBalance: 97_500,
              gap: 0,
              direction: "equal",
            },
          ],
        },
      ],
      checked: 1,
      matching: 1,
    });
  });

  it("reports a gap of one minor unit, with the direction of the real balance", () => {
    const [above, below] = [97_501, 97_499].map((amount) =>
      link([EXPENSE_MOVEMENT], [assertion(1, CHECKING_ID, "2026-03-31", amount)]),
    );

    expect(above?.accounts[0]?.links[0]).toMatchObject({ gap: -1, direction: "realAbove" });
    expect(below?.accounts[0]?.links[0]).toMatchObject({ gap: 1, direction: "realBelow" });
    expect(above).toMatchObject({ checked: 1, matching: 0 });
  });

  it("counts the matching assertions out of the checked ones", () => {
    const result = link(
      [EXPENSE_MOVEMENT],
      [
        assertion(1, CHECKING_ID, "2026-03-09", 100_000),
        assertion(2, CHECKING_ID, "2026-03-10", 97_500),
        assertion(3, CHECKING_ID, "2026-03-31", 90_000),
      ],
    );

    expect(result).toMatchObject({ checked: 3, matching: 2 });
    expect(result.accounts[0]?.links.map(({ assertionId }) => assertionId)).toEqual([1, 2, 3]);
  });

  it("ignores the assertions outside the period, the bounds included in it", () => {
    const result = link(
      [EXPENSE_MOVEMENT],
      [
        assertion(1, CHECKING_ID, "2026-02-28", 1),
        assertion(2, CHECKING_ID, "2026-03-01", 100_000),
        assertion(3, CHECKING_ID, "2026-03-31", 97_500),
        assertion(4, CHECKING_ID, "2026-04-01", 1),
      ],
    );

    expect(result.accounts[0]?.links.map(({ assertionId }) => assertionId)).toEqual([2, 3]);
  });

  it("adds the movements of the file to the transactions already recorded", () => {
    const result = link(
      [EXPENSE_MOVEMENT],
      [assertion(1, CHECKING_ID, "2026-03-31", 95_000)],
      { transactions: [{ accountId: CHECKING_ID, date: "2026-02-15", amount: -2_500 }] },
    );

    expect(result).toMatchObject({ checked: 1, matching: 1 });
  });

  it("does not count twice a movement the account already holds", () => {
    const reviewed = file([
      row("2026-03-10", "-25,00", EXPENSE, true),
      row("2026-03-12", "-10,00"),
    ]);
    const existing: AssertionMovement = { accountId: CHECKING_ID, date: "2026-03-10", amount: -2_500 };

    const result = link(
      movementsOf(reviewed),
      [assertion(1, CHECKING_ID, "2026-03-31", 100_000 - 2_500 - 1_000)],
      { transactions: [existing] },
    );

    expect(result).toMatchObject({ checked: 1, matching: 1 });
  });

  it("checks the savings accounts the file moves money to, one entry per account", () => {
    const movements = movementsOf(file([row("2026-03-10", "-150,00", SAVINGS)]));

    const result = link(movements, [
      assertion(1, CHECKING_ID, "2026-03-31", 85_000),
      assertion(2, A_ID, "2026-03-31", 100_000),
      assertion(3, B_ID, "2026-03-31", 25_001),
    ]);

    expect(result.accounts.map(({ accountId }) => accountId)).toEqual([CHECKING_ID, A_ID, B_ID]);
    expect(result).toMatchObject({ checked: 3, matching: 2 });
    expect(result.accounts[2]?.links[0]).toMatchObject({
      computedBalance: 25_000,
      gap: -1,
      direction: "realAbove",
    });
  });

  it("leaves out an account the file does not touch", () => {
    const result = link(
      [EXPENSE_MOVEMENT],
      [assertion(1, A_ID, "2026-03-31", 1), assertion(2, CHECKING_ID, "2026-03-31", 97_500)],
    );

    expect(result.accounts.map(({ accountId }) => accountId)).toEqual([CHECKING_ID]);
  });

  it("checks the receiving account of a file made only of duplicates", () => {
    const result = link([], [assertion(1, CHECKING_ID, "2026-03-31", 100_000)]);

    expect(result).toMatchObject({ checked: 1, matching: 1 });
  });

  it("ignores the assertions of an account that is not active", () => {
    const result = link(
      [EXPENSE_MOVEMENT],
      [assertion(1, CHECKING_ID, "2026-03-31", 1)],
      { accounts: ASSERTED_ACCOUNTS.filter(({ id }) => id !== CHECKING_ID) },
    );

    expect(result).toEqual({ accounts: [], checked: 0, matching: 0 });
  });
});
