import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { TransactionValidationError } from "../../src/domain/transaction";
import {
  AccountNotFoundError,
  archiveAccount,
  createAccount,
  getAccountBalance,
  updateAccount,
} from "../../src/ledger/accounts";
import {
  createTransaction,
  createTransfer,
  deleteTransaction,
  listTransactions,
  previewCeilingWarning,
  previewManualTransfer,
  recordManualTransfer,
  updateTransaction,
} from "../../src/ledger/transactions";
import {
  type AppDatabase,
  migrateDatabase,
  openDatabase,
} from "../../src/storage/database";

const CHECKING_INPUT = {
  name: "Checking",
  kind: "checking",
  currency: "EUR",
  openingDate: "2026-01-01",
  openingBalance: 5_627,
};

describe("transactions", () => {
  let dataDir: string;
  let db: AppDatabase;

  beforeEach(() => {
    dataDir = mkdtempSync(path.join(tmpdir(), "demain-test-"));
    db = openDatabase(dataDir);
    migrateDatabase(db);
  });

  afterEach(() => {
    db.$client.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("adds an expense to the opening balance in the computed balance", () => {
    const checking = createAccount(db, CHECKING_INPUT);

    createTransaction(db, {
      accountId: checking.id,
      date: "2026-02-10",
      amount: -1_250,
      kind: "expense",
      label: "Groceries",
    });

    expect(getAccountBalance(db, checking.id)).toBe(5_627 - 1_250);
  });

  it("stores the description and the payment mode", () => {
    const checking = createAccount(db, CHECKING_INPUT);

    const created = createTransaction(db, {
      accountId: checking.id,
      date: "2026-02-10",
      amount: -1_250,
      kind: "expense",
      label: "CB GROCERIES 10/02",
      description: " weekly shop ",
      paymentMode: "card",
    });

    expect(created).toMatchObject({
      description: "weekly shop",
      paymentMode: "card",
    });
  });

  it("refuses a transaction on an archived account", () => {
    const empty = createAccount(db, { ...CHECKING_INPUT, openingBalance: 0 });
    archiveAccount(db, empty.id);

    expect(() =>
      createTransaction(db, {
        accountId: empty.id,
        date: "2026-02-10",
        amount: -100,
        kind: "expense",
        label: "Too late",
      }),
    ).toThrow(TransactionValidationError);
  });

  it("refuses a transaction on an account that does not exist", () => {
    expect(() =>
      createTransaction(db, {
        accountId: 999,
        date: "2026-02-10",
        amount: -100,
        kind: "expense",
        label: "Nowhere",
      }),
    ).toThrow(AccountNotFoundError);
  });

  describe("transfers", () => {
    it("records two linked legs that move money between the accounts", () => {
      const checking = createAccount(db, CHECKING_INPUT);
      const livretA = createAccount(db, {
        ...CHECKING_INPUT,
        name: "Livret A",
        kind: "savings",
        openingBalance: 100_000,
      });

      const [outgoing, incoming] = createTransfer(db, {
        sourceId: checking.id,
        destinationId: livretA.id,
        amount: 2_000,
        date: "2026-02-15",
        label: "Savings",
      });

      expect(outgoing).toMatchObject({
        accountId: checking.id,
        amount: -2_000,
        kind: "transfer",
        transferCounterpartId: incoming.id,
      });
      expect(incoming).toMatchObject({
        accountId: livretA.id,
        amount: 2_000,
        kind: "transfer",
        transferCounterpartId: outgoing.id,
      });
      expect(getAccountBalance(db, checking.id)).toBe(5_627 - 2_000);
      expect(getAccountBalance(db, livretA.id)).toBe(102_000);
    });

    it("records nothing when the destination account is archived", () => {
      const checking = createAccount(db, CHECKING_INPUT);
      const closed = createAccount(db, { ...CHECKING_INPUT, openingBalance: 0 });
      archiveAccount(db, closed.id);

      expect(() =>
        createTransfer(db, {
          sourceId: checking.id,
          destinationId: closed.id,
          amount: 500,
          date: "2026-02-15",
          label: "Refused",
        }),
      ).toThrow(TransactionValidationError);
      expect(listTransactions(db)).toEqual([]);
    });
  });

  describe("deletion", () => {
    it("deletes a single transaction and restores the balance", () => {
      const checking = createAccount(db, CHECKING_INPUT);
      const expense = createTransaction(db, {
        accountId: checking.id,
        date: "2026-02-10",
        amount: -1_250,
        kind: "expense",
        label: "Groceries",
      });

      deleteTransaction(db, expense.id);

      expect(listTransactions(db)).toEqual([]);
      expect(getAccountBalance(db, checking.id)).toBe(5_627);
    });

    it("deletes both legs when one leg of a transfer is deleted", () => {
      const checking = createAccount(db, CHECKING_INPUT);
      const livretA = createAccount(db, { ...CHECKING_INPUT, name: "Livret A" });
      const [, incoming] = createTransfer(db, {
        sourceId: checking.id,
        destinationId: livretA.id,
        amount: 2_000,
        date: "2026-02-15",
        label: "Savings",
      });

      deleteTransaction(db, incoming.id);

      expect(listTransactions(db)).toEqual([]);
      expect(getAccountBalance(db, checking.id)).toBe(5_627);
      expect(getAccountBalance(db, livretA.id)).toBe(5_627);
    });
  });

  describe("edition", () => {
    it("replaces the fields of a transaction and updates the balance", () => {
      const checking = createAccount(db, CHECKING_INPUT);
      const expense = createTransaction(db, {
        accountId: checking.id,
        date: "2026-02-10",
        amount: -1_250,
        kind: "expense",
        label: "Groceries",
      });

      const updated = updateTransaction(db, expense.id, {
        accountId: checking.id,
        date: "2026-02-11",
        amount: -1_900,
        kind: "expense",
        label: "Groceries and bakery",
      });

      expect(updated).toMatchObject({
        id: expense.id,
        date: "2026-02-11",
        amount: -1_900,
        label: "Groceries and bakery",
      });
      expect(getAccountBalance(db, checking.id)).toBe(5_627 - 1_900);
    });

    it("refuses to edit one leg of a transfer", () => {
      const checking = createAccount(db, CHECKING_INPUT);
      const livretA = createAccount(db, { ...CHECKING_INPUT, name: "Livret A" });
      const [outgoing] = createTransfer(db, {
        sourceId: checking.id,
        destinationId: livretA.id,
        amount: 2_000,
        date: "2026-02-15",
        label: "Savings",
      });

      expect(() =>
        updateTransaction(db, outgoing.id, {
          accountId: checking.id,
          date: "2026-02-15",
          amount: -3_000,
          kind: "expense",
          label: "Savings",
        }),
      ).toThrow(TransactionValidationError);
    });
  });

  describe("archived accounts", () => {
    function archivedWithHistory() {
      const closing = createAccount(db, { ...CHECKING_INPUT, openingBalance: 0 });
      const other = createAccount(db, { ...CHECKING_INPUT, name: "Other" });
      const income = createTransaction(db, {
        accountId: closing.id,
        date: "2026-02-01",
        amount: 700,
        kind: "income",
        label: "Refund",
      });
      const [, incoming] = createTransfer(db, {
        sourceId: closing.id,
        destinationId: other.id,
        amount: 700,
        date: "2026-02-02",
        label: "Empty it",
      });
      archiveAccount(db, closing.id);
      return { closing, income, incoming };
    }

    it("refuses to delete a transaction that belongs to an archived account", () => {
      const { income } = archivedWithHistory();

      expect(() => deleteTransaction(db, income.id)).toThrow(
        TransactionValidationError,
      );
    });

    it("refuses to delete the transfer from the other side when a leg is archived", () => {
      const { incoming } = archivedWithHistory();

      expect(() => deleteTransaction(db, incoming.id)).toThrow(
        TransactionValidationError,
      );
    });

    it("refuses to move a transaction out of an archived account", () => {
      const { closing, income } = archivedWithHistory();
      const open = createAccount(db, { ...CHECKING_INPUT, name: "Open" });

      expect(() =>
        updateTransaction(db, income.id, {
          accountId: open.id,
          date: "2026-02-01",
          amount: 700,
          kind: "income",
          label: "Refund",
        }),
      ).toThrow(TransactionValidationError);
      expect(getAccountBalance(db, closing.id)).toBe(0);
    });

    it("refuses to edit a transaction that belongs to an archived account", () => {
      const { closing, income } = archivedWithHistory();

      expect(() =>
        updateTransaction(db, income.id, {
          accountId: closing.id,
          date: "2026-02-01",
          amount: 900,
          kind: "income",
          label: "Refund",
        }),
      ).toThrow(TransactionValidationError);
    });
  });

  describe("manual transfers above a ceiling", () => {
    function setup() {
      const checking = createAccount(db, { ...CHECKING_INPUT, openingBalance: 100_000 });
      const livretA = createAccount(db, {
        ...CHECKING_INPUT,
        name: "Livret A",
        kind: "savings",
        openingBalance: 1_000_000,
      });
      const livretJeune = createAccount(db, {
        ...CHECKING_INPUT,
        name: "Livret Jeune",
        kind: "savings",
        openingBalance: 155_000,
        depositCeiling: 160_000,
        overflowAccountId: livretA.id,
      });
      const request = {
        sourceId: checking.id,
        destinationId: livretJeune.id,
        amount: 20_000,
        date: "2026-03-01",
        label: "Savings",
      };
      return { checking, livretA, livretJeune, request };
    }

    it("previews the split and the overflow account to preselect", () => {
      const { livretA, request } = setup();

      expect(previewManualTransfer(db, request)).toEqual({
        deposited: 5_000,
        surplus: 15_000,
        suggestedOverflowAccountId: livretA.id,
      });
    });

    it("records the whole amount when it fits, without any decision", () => {
      const { checking, livretJeune, request } = setup();

      const result = recordManualTransfer(db, { ...request, amount: 4_000 }, null);

      expect(result.unplaced).toBe(0);
      expect(result.transfers).toHaveLength(1);
      expect(getAccountBalance(db, livretJeune.id)).toBe(159_000);
      expect(getAccountBalance(db, checking.id)).toBe(96_000);
    });

    it("asks for a decision instead of guessing when there is a surplus", () => {
      const { request } = setup();

      expect(() => recordManualTransfer(db, request, null)).toThrow(
        expect.objectContaining({ name: "SurplusDecisionRequiredError" }),
      );
      expect(listTransactions(db)).toEqual([]);
    });

    it("deposits only the room when the user chooses so", () => {
      const { checking, livretJeune, livretA, request } = setup();

      const result = recordManualTransfer(db, request, { kind: "room-only" });

      expect(result.transfers).toHaveLength(1);
      expect(result.unplaced).toBe(15_000);
      expect(getAccountBalance(db, livretJeune.id)).toBe(160_000);
      expect(getAccountBalance(db, livretA.id)).toBe(1_000_000);
      expect(getAccountBalance(db, checking.id)).toBe(95_000);
    });

    it("sends the surplus to the chosen account in the same recording", () => {
      const { checking, livretJeune, livretA, request } = setup();

      const result = recordManualTransfer(db, request, {
        kind: "send-surplus",
        accountId: livretA.id,
      });

      expect(result.transfers).toHaveLength(2);
      expect(result.unplaced).toBe(0);
      expect(getAccountBalance(db, livretJeune.id)).toBe(160_000);
      expect(getAccountBalance(db, livretA.id)).toBe(1_015_000);
      expect(getAccountBalance(db, checking.id)).toBe(80_000);
    });

    it("keeps in the source what the chosen account cannot take either", () => {
      const { checking, livretA, livretJeune, request } = setup();
      updateAccount(db, livretA.id, {
        ...CHECKING_INPUT,
        name: "Livret A",
        kind: "savings",
        openingBalance: 1_000_000,
        depositCeiling: 1_010_000,
      });

      const result = recordManualTransfer(db, request, {
        kind: "send-surplus",
        accountId: livretA.id,
      });

      expect(result.unplaced).toBe(5_000);
      expect(getAccountBalance(db, livretJeune.id)).toBe(160_000);
      expect(getAccountBalance(db, livretA.id)).toBe(1_010_000);
      expect(getAccountBalance(db, checking.id)).toBe(85_000);
    });

    it("records nothing when no room is left anywhere", () => {
      const { checking, livretJeune, request } = setup();
      createTransaction(db, {
        accountId: livretJeune.id,
        date: "2026-02-01",
        amount: 5_000,
        kind: "interest",
        label: "Interest",
      });

      expect(() =>
        recordManualTransfer(db, request, { kind: "room-only" }),
      ).toThrow(TransactionValidationError);
      expect(listTransactions(db)).toHaveLength(1);
      expect(getAccountBalance(db, checking.id)).toBe(100_000);
    });
  });

  describe("ceiling warning preview", () => {
    it("leaves the edited transaction out of the balance it is checked against", () => {
      const livretJeune = createAccount(db, {
        ...CHECKING_INPUT,
        kind: "savings",
        openingBalance: 157_000,
        depositCeiling: 160_000,
      });
      const gift = createTransaction(db, {
        accountId: livretJeune.id,
        date: "2026-03-01",
        amount: 1_000,
        kind: "income",
        label: "Gift",
      });

      const warning = previewCeilingWarning(
        db,
        {
          accountId: livretJeune.id,
          date: "2026-03-01",
          amount: 5_000,
          kind: "income",
          label: "Gift",
        },
        { replacingTransactionId: gift.id },
      );

      // 157 000 without the gift, plus 5 000: 2 000 above the ceiling.
      expect(warning).toEqual({ excess: 2_000 });
    });

    it("warns about an income above the ceiling and never about interest", () => {
      const livretJeune = createAccount(db, {
        ...CHECKING_INPUT,
        kind: "savings",
        openingBalance: 158_000,
        depositCeiling: 160_000,
      });
      const entry = {
        accountId: livretJeune.id,
        date: "2026-03-01",
        amount: 5_000,
        label: "Gift",
      };

      expect(previewCeilingWarning(db, { ...entry, kind: "income" })).toEqual({
        excess: 3_000,
      });
      expect(previewCeilingWarning(db, { ...entry, kind: "interest" })).toBeNull();
    });
  });
});
