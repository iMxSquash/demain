import { describe, expect, it } from "vitest";

import type { OverflowAccount } from "../../src/domain/overflow";
import {
  buildTransferLegs,
  ceilingWarningFor,
  splitManualTransfer,
  TransactionValidationError,
  validateTransactionInput,
  type TransactionInput,
  type TransferEndpoint,
} from "../../src/domain/transaction";

const CHECKING_ID = 1;
const LIVRET_A_ID = 2;
const LIVRET_JEUNE_ID = 3;

function endpoint(
  overrides: Partial<TransferEndpoint> & { id: number },
): TransferEndpoint {
  return { currency: "EUR", archived: false, ...overrides };
}

function input(overrides: Partial<TransactionInput> = {}): TransactionInput {
  return {
    accountId: CHECKING_ID,
    date: "2026-03-15",
    amount: -1_250,
    kind: "expense",
    label: "Groceries",
    ...overrides,
  };
}

describe("validateTransactionInput", () => {
  it("rejects an expense with a positive amount", () => {
    expect(() => validateTransactionInput(input({ amount: 1_250 }))).toThrow(
      TransactionValidationError,
    );
  });

  it("rejects an income with a negative amount", () => {
    expect(() =>
      validateTransactionInput(input({ kind: "income", amount: -500 })),
    ).toThrow(TransactionValidationError);
  });

  it("rejects an interest with a negative amount", () => {
    expect(() =>
      validateTransactionInput(input({ kind: "interest", amount: -5 })),
    ).toThrow(TransactionValidationError);
  });

  it("rejects a zero amount", () => {
    expect(() =>
      validateTransactionInput(input({ kind: "income", amount: 0 })),
    ).toThrow(TransactionValidationError);
  });

  it("rejects a date that does not exist", () => {
    expect(() =>
      validateTransactionInput(input({ date: "2026-02-30" })),
    ).toThrow(TransactionValidationError);
  });

  it("rejects a blank label", () => {
    expect(() => validateTransactionInput(input({ label: "   " }))).toThrow(
      TransactionValidationError,
    );
  });

  it("trims the label of a valid transaction", () => {
    const result = validateTransactionInput(input({ label: "  Groceries " }));

    expect(result).toEqual({
      ...input({ label: "Groceries" }),
      description: null,
      paymentMode: null,
      categoryId: null,
    });
  });

  it("keeps the category of a transaction and turns an absent one into none", () => {
    const categorized = validateTransactionInput(input({ categoryId: 7 }));
    const plain = validateTransactionInput(input());

    expect(categorized.categoryId).toBe(7);
    expect(plain.categoryId).toBeNull();
  });

  it("keeps a known payment mode", () => {
    const result = validateTransactionInput(input({ paymentMode: "direct_debit" }));

    expect(result.paymentMode).toBe("direct_debit");
  });

  it("rejects an unknown payment mode", () => {
    expect(() =>
      validateTransactionInput(input({ paymentMode: "cheque" })),
    ).toThrow(expect.objectContaining({ field: "paymentMode" }));
  });

  it("trims the description and turns a blank one into none", () => {
    const noted = validateTransactionInput(input({ description: "  for the party " }));
    const blank = validateTransactionInput(input({ description: "   " }));

    expect(noted.description).toBe("for the party");
    expect(blank.description).toBeNull();
  });
});

describe("buildTransferLegs", () => {
  it("builds two legs of opposite sign, one on each account", () => {
    const legs = buildTransferLegs({
      source: endpoint({ id: CHECKING_ID }),
      destination: endpoint({ id: LIVRET_A_ID }),
      amount: 45_000,
      date: "2026-03-01",
      label: "Monthly savings",
    });

    expect(legs).toEqual([
      {
        accountId: CHECKING_ID,
        date: "2026-03-01",
        amount: -45_000,
        kind: "transfer",
        label: "Monthly savings",
      },
      {
        accountId: LIVRET_A_ID,
        date: "2026-03-01",
        amount: 45_000,
        kind: "transfer",
        label: "Monthly savings",
      },
    ]);
  });

  it("rejects a transfer from an account to itself", () => {
    expect(() =>
      buildTransferLegs({
        source: endpoint({ id: CHECKING_ID }),
        destination: endpoint({ id: CHECKING_ID }),
        amount: 1_000,
        date: "2026-03-01",
        label: "Loop",
      }),
    ).toThrow(TransactionValidationError);
  });

  it("rejects a transfer from or to an archived account", () => {
    const base = {
      amount: 1_000,
      date: "2026-03-01",
      label: "Empty it",
    };

    expect(() =>
      buildTransferLegs({
        ...base,
        source: endpoint({ id: CHECKING_ID, archived: true }),
        destination: endpoint({ id: LIVRET_A_ID }),
      }),
    ).toThrow(TransactionValidationError);
    expect(() =>
      buildTransferLegs({
        ...base,
        source: endpoint({ id: CHECKING_ID }),
        destination: endpoint({ id: LIVRET_A_ID, archived: true }),
      }),
    ).toThrow(TransactionValidationError);
  });

  it("rejects a transfer between two currencies", () => {
    expect(() =>
      buildTransferLegs({
        source: endpoint({ id: CHECKING_ID, currency: "EUR" }),
        destination: endpoint({ id: LIVRET_A_ID, currency: "USD" }),
        amount: 1_000,
        date: "2026-03-01",
        label: "Cross",
      }),
    ).toThrow(TransactionValidationError);
  });

  it.each([
    ["a zero amount", { amount: 0 }],
    ["a negative amount", { amount: -1_000 }],
    ["a date that does not exist", { date: "2026-13-01" }],
    ["a blank label", { label: " " }],
  ])("rejects %s", (_name, overrides) => {
    expect(() =>
      buildTransferLegs({
        source: endpoint({ id: CHECKING_ID }),
        destination: endpoint({ id: LIVRET_A_ID }),
        amount: 1_000,
        date: "2026-03-01",
        label: "Savings",
        ...overrides,
      }),
    ).toThrow(TransactionValidationError);
  });
});

function overflowAccount(
  overrides: Partial<OverflowAccount> & { id: number },
): OverflowAccount {
  return {
    currency: "EUR",
    balance: 0,
    ceiling: null,
    overflowAccountId: null,
    archived: false,
    ...overrides,
  };
}

describe("splitManualTransfer", () => {
  it("deposits everything when the destination has no ceiling", () => {
    const accounts = [overflowAccount({ id: LIVRET_A_ID, balance: 500_000 })];

    const split = splitManualTransfer(20_000, LIVRET_A_ID, accounts);

    expect(split).toEqual({
      deposited: 20_000,
      surplus: 0,
      suggestedOverflowAccountId: null,
    });
  });

  it("splits at the room left under the ceiling and suggests the overflow account", () => {
    const accounts = [
      overflowAccount({
        id: LIVRET_JEUNE_ID,
        balance: 155_000,
        ceiling: 160_000,
        overflowAccountId: LIVRET_A_ID,
      }),
      overflowAccount({ id: LIVRET_A_ID, balance: 1_000_000 }),
    ];

    const split = splitManualTransfer(20_000, LIVRET_JEUNE_ID, accounts);

    expect(split).toEqual({
      deposited: 5_000,
      surplus: 15_000,
      suggestedOverflowAccountId: LIVRET_A_ID,
    });
  });

  it("deposits nothing when the balance already exceeds the ceiling through interest", () => {
    const accounts = [
      overflowAccount({ id: LIVRET_JEUNE_ID, balance: 160_300, ceiling: 160_000 }),
    ];

    const split = splitManualTransfer(1_000, LIVRET_JEUNE_ID, accounts);

    expect(split).toEqual({
      deposited: 0,
      surplus: 1_000,
      suggestedOverflowAccountId: null,
    });
  });

  it("suggests no account when the surplus is zero, even if one is configured", () => {
    const accounts = [
      overflowAccount({
        id: LIVRET_JEUNE_ID,
        balance: 100_000,
        ceiling: 160_000,
        overflowAccountId: LIVRET_A_ID,
      }),
      overflowAccount({ id: LIVRET_A_ID }),
    ];

    const split = splitManualTransfer(10_000, LIVRET_JEUNE_ID, accounts);

    expect(split.suggestedOverflowAccountId).toBeNull();
  });
});

describe("ceilingWarningFor", () => {
  const livretJeune = overflowAccount({
    id: LIVRET_JEUNE_ID,
    balance: 158_000,
    ceiling: 160_000,
  });

  it("warns about the excess of an income that goes above the ceiling", () => {
    const warning = ceilingWarningFor(
      input({ accountId: LIVRET_JEUNE_ID, kind: "income", amount: 5_000 }),
      livretJeune,
    );

    expect(warning).toEqual({ excess: 3_000 });
  });

  it("warns about the excess of an incoming transfer that goes above the ceiling", () => {
    const warning = ceilingWarningFor({ kind: "transfer", amount: 5_000 }, livretJeune);

    expect(warning).toEqual({ excess: 3_000 });
  });

  it("does not warn about an outgoing transfer", () => {
    const warning = ceilingWarningFor({ kind: "transfer", amount: -5_000 }, livretJeune);

    expect(warning).toBeNull();
  });

  it("accepts interest above the ceiling without a warning", () => {
    const warning = ceilingWarningFor(
      input({ accountId: LIVRET_JEUNE_ID, kind: "interest", amount: 5_000 }),
      livretJeune,
    );

    expect(warning).toBeNull();
  });

  it("does not warn for an income that fits, an expense or an account without ceiling", () => {
    const fitting = input({ accountId: LIVRET_JEUNE_ID, kind: "income", amount: 2_000 });
    const expense = input({ accountId: LIVRET_JEUNE_ID, amount: -9_000 });
    const noCeiling = overflowAccount({ id: LIVRET_A_ID, balance: 1_000_000 });

    expect(ceilingWarningFor(fitting, livretJeune)).toBeNull();
    expect(ceilingWarningFor(expense, livretJeune)).toBeNull();
    expect(
      ceilingWarningFor(input({ kind: "income", amount: 5_000 }), noCeiling),
    ).toBeNull();
  });
});
