import { describe, expect, it } from "vitest";

import type { ExchangeRate } from "../../src/domain/exchange-rate";
import {
  computeMonthlySynthesis,
  type SynthesisAccount,
  type SynthesisTransaction,
} from "../../src/domain/synthesis";

const CHECKING_ID = 1;
const LIVRET_A_ID = 2;
const LIVRET_JEUNE_ID = 3;

function account(
  overrides: Partial<SynthesisAccount> & { id: number },
): SynthesisAccount {
  return {
    kind: "checking",
    currency: "EUR",
    openingDate: "2026-01-01",
    openingBalance: 0,
    ...overrides,
  };
}

let nextId = 1;
function transaction(
  overrides: Partial<SynthesisTransaction> &
    Pick<SynthesisTransaction, "accountId" | "date" | "amount" | "kind">,
): SynthesisTransaction {
  return { id: nextId++, transferCounterpartId: null, ...overrides };
}

const checking = account({ id: CHECKING_ID });
const livretA = account({ id: LIVRET_A_ID, kind: "savings" });
const livretJeune = account({ id: LIVRET_JEUNE_ID, kind: "savings" });

// A transfer is two legs of opposite sign that point to each other.
function transfer(
  from: number,
  to: number,
  date: string,
  amount: number,
): SynthesisTransaction[] {
  const out = nextId++;
  const incoming = nextId++;
  return [
    { id: out, accountId: from, date, amount: -amount, kind: "transfer", transferCounterpartId: incoming },
    { id: incoming, accountId: to, date, amount, kind: "transfer", transferCounterpartId: out },
  ];
}

describe("computeMonthlySynthesis", () => {
  it("computes the net of the month from income, interest and expenses, transfers excluded", () => {
    const transactions = [
      transaction({ accountId: CHECKING_ID, date: "2026-01-05", amount: 200_000, kind: "income" }),
      transaction({ accountId: CHECKING_ID, date: "2026-01-10", amount: 300, kind: "interest" }),
      transaction({ accountId: CHECKING_ID, date: "2026-01-12", amount: -45_000, kind: "expense" }),
      transaction({ accountId: CHECKING_ID, date: "2026-02-03", amount: -9_900, kind: "expense" }),
    ];

    const result = computeMonthlySynthesis({
      accounts: [checking],
      transactions,
      referenceCurrency: "EUR",
      throughMonth: "2026-02",
    });

    expect(result.map((month) => [month.month, month.net])).toEqual([
      ["2026-01", 155_300],
      ["2026-02", -9_900],
    ]);
  });

  it("counts transfers into savings minus transfers back out as the savings of the month", () => {
    const transactions = [
      ...transfer(CHECKING_ID, LIVRET_A_ID, "2026-02-02", 65_000),
      ...transfer(LIVRET_A_ID, CHECKING_ID, "2026-02-20", 5_000),
      // Savings to savings is neither a deposit nor a withdrawal.
      ...transfer(LIVRET_JEUNE_ID, LIVRET_A_ID, "2026-02-25", 15_000),
    ];

    const result = computeMonthlySynthesis({
      accounts: [checking, livretA, livretJeune],
      transactions,
      referenceCurrency: "EUR",
      throughMonth: "2026-02",
    });

    expect(result.map((month) => [month.month, month.savings])).toEqual([
      ["2026-01", 0],
      ["2026-02", 60_000],
    ]);
  });

  it("does not count a transfer between two non savings accounts", () => {
    const other = account({ id: 4, kind: "other" });
    const transactions = transfer(CHECKING_ID, 4, "2026-01-15", 10_000);

    const [january] = computeMonthlySynthesis({
      accounts: [checking, other],
      transactions,
      referenceCurrency: "EUR",
      throughMonth: "2026-01",
    });

    expect(january?.savings).toBe(0);
  });

  it("reproduces the worked example of the sheet: cumulative account 2.98 then 159.05", () => {
    // DOMAIN, worked example. Net 576.14 and 806.07, savings 573.16 and 650.00.
    const transactions = [
      transaction({ accountId: CHECKING_ID, date: "2026-01-31", amount: 57_614, kind: "income" }),
      ...transfer(CHECKING_ID, LIVRET_A_ID, "2026-01-31", 57_316),
      transaction({ accountId: CHECKING_ID, date: "2026-02-28", amount: 80_607, kind: "income" }),
      ...transfer(CHECKING_ID, LIVRET_A_ID, "2026-02-28", 65_000),
    ];

    const result = computeMonthlySynthesis({
      accounts: [checking, livretA],
      transactions,
      referenceCurrency: "EUR",
      throughMonth: "2026-02",
    });

    expect(
      result.map((month) => [
        month.month,
        month.net,
        month.savings,
        month.cumulativeSavings,
        month.cumulativeAccount,
      ]),
    ).toEqual([
      ["2026-01", 57_614, 57_316, 57_316, 298],
      ["2026-02", 80_607, 65_000, 122_316, 15_905],
    ]);
  });

  it("computes the balance of each open account on the last day of the month", () => {
    const opening = account({
      id: CHECKING_ID,
      openingDate: "2026-01-01",
      openingBalance: 100_000,
    });
    const laterOpened = account({
      id: LIVRET_A_ID,
      kind: "savings",
      openingDate: "2026-02-10",
      openingBalance: 50_000,
    });
    const transactions = [
      transaction({ accountId: CHECKING_ID, date: "2026-01-31", amount: -1_000, kind: "expense" }),
      transaction({ accountId: CHECKING_ID, date: "2026-02-01", amount: -2_000, kind: "expense" }),
      transaction({ accountId: LIVRET_A_ID, date: "2026-02-28", amount: 400, kind: "interest" }),
    ];

    const result = computeMonthlySynthesis({
      accounts: [opening, laterOpened],
      transactions,
      referenceCurrency: "EUR",
      throughMonth: "2026-02",
    });

    // The savings account is absent from the months before its opening.
    expect(result.map((month) => [month.month, month.balances, month.total])).toEqual([
      [
        "2026-01",
        [{ accountId: CHECKING_ID, currency: "EUR", balance: 99_000 }],
        99_000,
      ],
      [
        "2026-02",
        [
          { accountId: CHECKING_ID, currency: "EUR", balance: 97_000 },
          { accountId: LIVRET_A_ID, currency: "EUR", balance: 50_400 },
        ],
        147_400,
      ],
    ]);
  });

  it("keeps the checking balance equal to its opening balance plus the cumulative account", () => {
    const withOpening = account({ id: CHECKING_ID, openingBalance: 12_345 });
    const transactions = [
      transaction({ accountId: CHECKING_ID, date: "2026-01-15", amount: 57_614, kind: "income" }),
      ...transfer(CHECKING_ID, LIVRET_A_ID, "2026-01-31", 57_316),
    ];

    const [january] = computeMonthlySynthesis({
      accounts: [withOpening, livretA],
      transactions,
      referenceCurrency: "EUR",
      throughMonth: "2026-01",
    });

    const checkingBalance = january?.balances.find(
      (entry) => entry.accountId === CHECKING_ID,
    )?.balance;
    expect(checkingBalance).toBe(12_345 + (january?.cumulativeAccount ?? 0));
  });

  it("reports a currency without any rate instead of adding it to the totals", () => {
    const dollars = account({
      id: 9,
      currency: "USD",
      openingBalance: 70_000,
    });
    const transactions = [
      transaction({ accountId: CHECKING_ID, date: "2026-01-10", amount: -500, kind: "expense" }),
      transaction({ accountId: 9, date: "2026-01-11", amount: -9_900, kind: "expense" }),
    ];

    const [january] = computeMonthlySynthesis({
      accounts: [checking, dollars],
      transactions,
      referenceCurrency: "EUR",
      throughMonth: "2026-01",
    });

    expect(january).toMatchObject({
      net: -500,
      total: -500,
      unconvertedCurrencies: ["USD"],
    });
    expect(january?.balances).toContainEqual({
      accountId: 9,
      currency: "USD",
      balance: 60_100,
    });
  });

  it("converts the balance of another currency into the total at the rate of the end of the month", () => {
    const dollars = account({ id: 9, currency: "USD", openingBalance: 70_000 });
    const eurUsd: ExchangeRate = {
      date: "2026-01-05",
      base: "EUR",
      quote: "USD",
      rate: 110_000_000,
    };
    const transactions = [
      transaction({ accountId: CHECKING_ID, date: "2026-01-10", amount: -500, kind: "expense" }),
      transaction({ accountId: 9, date: "2026-01-11", amount: -9_900, kind: "expense" }),
    ];

    const [january] = computeMonthlySynthesis({
      accounts: [checking, dollars],
      transactions,
      referenceCurrency: "EUR",
      exchangeRates: [eurUsd],
      throughMonth: "2026-01",
    });

    // 601.00 USD at 1.1 is 546.3636... EUR, which rounds to 546.36.
    expect(january).toMatchObject({ total: -500 + 54_636, unconvertedCurrencies: [] });
    expect(january?.balances).toContainEqual({
      accountId: 9,
      currency: "USD",
      balance: 60_100,
    });
  });

  it("values each month with the rate in force at its own end, and reports the months before the first rate", () => {
    const dollars = account({ id: 9, currency: "USD", openingBalance: 10_000 });
    const rates: ExchangeRate[] = [
      { date: "2026-02-10", base: "EUR", quote: "USD", rate: 100_000_000 },
      { date: "2026-03-10", base: "EUR", quote: "USD", rate: 200_000_000 },
    ];

    const months = computeMonthlySynthesis({
      accounts: [dollars],
      transactions: [],
      referenceCurrency: "EUR",
      exchangeRates: rates,
      throughMonth: "2026-03",
    });

    expect(months.map((m) => [m.month, m.total, m.unconvertedCurrencies])).toEqual([
      ["2026-01", 0, ["USD"]],
      ["2026-02", 10_000, []],
      ["2026-03", 5_000, []],
    ]);
  });

  it("converts each flow of another currency into the net at the rate of its own date", () => {
    const dollars = account({ id: 9, currency: "USD" });
    const rates: ExchangeRate[] = [
      { date: "2026-01-01", base: "EUR", quote: "USD", rate: 100_000_000 },
      { date: "2026-01-15", base: "EUR", quote: "USD", rate: 200_000_000 },
    ];
    const transactions = [
      transaction({ accountId: CHECKING_ID, date: "2026-01-02", amount: -500, kind: "expense" }),
      transaction({ accountId: 9, date: "2026-01-10", amount: -1_000, kind: "expense" }),
      transaction({ accountId: 9, date: "2026-01-20", amount: -1_000, kind: "expense" }),
    ];

    const [january] = computeMonthlySynthesis({
      accounts: [checking, dollars],
      transactions,
      referenceCurrency: "EUR",
      exchangeRates: rates,
      throughMonth: "2026-01",
    });

    // 10.00 USD at 1.0 is 10.00 EUR, then at 2.0 it is 5.00 EUR.
    expect(january?.net).toBe(-500 - 1_000 - 500);
  });

  it("reports a currency whose flow predates its first rate, and leaves that flow out of the net", () => {
    const dollars = account({ id: 9, currency: "USD", openingBalance: 10_000 });
    const rate: ExchangeRate = {
      date: "2026-01-20",
      base: "EUR",
      quote: "USD",
      rate: 100_000_000,
    };
    const transactions = [
      transaction({ accountId: 9, date: "2026-01-11", amount: -1_000, kind: "expense" }),
    ];

    const [january] = computeMonthlySynthesis({
      accounts: [dollars],
      transactions,
      referenceCurrency: "EUR",
      exchangeRates: [rate],
      throughMonth: "2026-01",
    });

    // The balance is valued at the end of the month, but the flow had no rate on its day.
    expect(january).toMatchObject({
      net: 0,
      total: 9_000,
      unconvertedCurrencies: ["USD"],
    });
  });

  it("converts the savings of another currency at the rate of the transfer date", () => {
    const dollarChecking = account({ id: 8, currency: "USD" });
    const dollarSavings = account({ id: 9, kind: "savings", currency: "USD" });
    const rate: ExchangeRate = {
      date: "2026-01-01",
      base: "EUR",
      quote: "USD",
      rate: 125_000_000,
    };

    const [january] = computeMonthlySynthesis({
      accounts: [dollarChecking, dollarSavings],
      transactions: transfer(8, 9, "2026-01-15", 10_000),
      referenceCurrency: "EUR",
      exchangeRates: [rate],
      throughMonth: "2026-01",
    });

    // 100.00 USD at 1.25 is 80.00 EUR.
    expect(january?.savings).toBe(8_000);
  });

  it("returns nothing when there is no account and no transaction", () => {
    const result = computeMonthlySynthesis({
      accounts: [],
      transactions: [],
      referenceCurrency: "EUR",
      throughMonth: "2026-06",
    });

    expect(result).toEqual([]);
  });

  it("returns nothing when the last month is before the start of the series", () => {
    const result = computeMonthlySynthesis({
      accounts: [checking],
      transactions: [],
      referenceCurrency: "EUR",
      throughMonth: "2025-12",
    });

    expect(result).toEqual([]);
  });

  it("keeps the months without movement and crosses a year boundary", () => {
    const withOpening = account({
      id: CHECKING_ID,
      openingDate: "2025-11-15",
      openingBalance: 5_000,
    });

    const result = computeMonthlySynthesis({
      accounts: [withOpening],
      transactions: [
        transaction({ accountId: CHECKING_ID, date: "2026-01-20", amount: -700, kind: "expense" }),
      ],
      referenceCurrency: "EUR",
      throughMonth: "2026-01",
    });

    expect(result.map((month) => [month.month, month.net, month.total])).toEqual([
      ["2025-11", 0, 5_000],
      ["2025-12", 0, 5_000],
      ["2026-01", -700, 4_300],
    ]);
  });
});
