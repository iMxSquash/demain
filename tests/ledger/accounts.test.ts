import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { eq } from "drizzle-orm";

import {
  archiveAccount,
  createAccount,
  listAccounts,
  listOverflowAccounts,
  updateAccount,
} from "../../src/ledger/accounts";
import { createTransaction, createTransfer } from "../../src/ledger/transactions";
import {
  type AppDatabase,
  migrateDatabase,
  openDatabase,
} from "../../src/storage/database";
import { createPlannedItem } from "../../src/ledger/planned-items";
import { accounts, plannedItems } from "../../src/storage/schema";


const TODAY = "2026-06-15";

const CHECKING_INPUT = {
  name: "Checking",
  kind: "checking",
  currency: "EUR",
  openingDate: "2026-01-01",
  openingBalance: 5627,
};

describe("accounts", () => {
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

  it("creates an account and lists it", () => {
    const created = createAccount(db, CHECKING_INPUT);

    expect(created).toEqual({
      ...CHECKING_INPUT,
      id: expect.any(Number),
      archived: false,
      depositCeiling: null,
      overflowAccountId: null,
    });
    expect(listAccounts(db)).toEqual([created]);
  });

  it("hides an archived account from the default list but keeps it for history", () => {
    const checking = createAccount(db, CHECKING_INPUT);
    const livretA = createAccount(db, {
      ...CHECKING_INPUT,
      name: "Livret A",
      kind: "savings",
      openingBalance: 0,
    });

    archiveAccount(db, livretA.id, TODAY);

    expect(listAccounts(db)).toEqual([checking]);
    expect(listAccounts(db, { includeArchived: true })).toEqual([
      checking,
      { ...livretA, archived: true },
    ]);
  });

  it("updates the fields of an account", () => {
    const created = createAccount(db, CHECKING_INPUT);

    const updated = updateAccount(db, created.id, {
      ...CHECKING_INPUT,
      name: "Main checking",
      openingBalance: 6000,
    });

    expect(updated).toEqual({
      ...created,
      name: "Main checking",
      openingBalance: 6000,
    });
    expect(listAccounts(db)).toEqual([updated]);
  });

  it("refuses an invalid update and leaves the account unchanged", () => {
    const created = createAccount(db, CHECKING_INPUT);

    expect(() =>
      updateAccount(db, created.id, { ...CHECKING_INPUT, name: " " }),
    ).toThrow(expect.objectContaining({ field: "name" }));
    expect(listAccounts(db)).toEqual([created]);
  });

  it("reports an unknown account instead of silently doing nothing", () => {
    expect(() => updateAccount(db, 999, CHECKING_INPUT)).toThrow(
      expect.objectContaining({ name: "AccountNotFoundError" }),
    );
    expect(() => archiveAccount(db, 999, TODAY)).toThrow(
      expect.objectContaining({ name: "AccountNotFoundError" }),
    );
  });

  describe("archiving and transactions", () => {
    const EXPENSE = {
      date: "2026-02-10",
      amount: -1_250,
      kind: "expense" as const,
      label: "Groceries",
    };

    it("refuses to archive an account whose balance is not zero", () => {
      const checking = createAccount(db, CHECKING_INPUT);

      expect(() => archiveAccount(db, checking.id, TODAY)).toThrow(
        expect.objectContaining({ name: "AccountNotEmptyError" }),
      );
      expect(listAccounts(db)).toHaveLength(1);
    });

    it("refuses to archive an account whose balance is negative", () => {
      const checking = createAccount(db, { ...CHECKING_INPUT, openingBalance: 0 });
      createTransaction(db, { ...EXPENSE, accountId: checking.id });

      expect(() => archiveAccount(db, checking.id, TODAY)).toThrow(
        expect.objectContaining({ name: "AccountNotEmptyError" }),
      );
    });

    it("archives an account once a transfer has emptied it", () => {
      const checking = createAccount(db, CHECKING_INPUT);
      const livretA = createAccount(db, { ...CHECKING_INPUT, name: "Livret A" });
      createTransfer(db, {
        sourceId: checking.id,
        destinationId: livretA.id,
        amount: 5_627,
        date: "2026-02-15",
        label: "Empty checking",
      });

      expect(() => archiveAccount(db, checking.id, TODAY)).not.toThrow();
    });

    it("refuses a currency change once the account has a transaction", () => {
      const checking = createAccount(db, CHECKING_INPUT);
      createTransaction(db, { ...EXPENSE, accountId: checking.id });

      expect(() =>
        updateAccount(db, checking.id, { ...CHECKING_INPUT, currency: "USD" }),
      ).toThrow(expect.objectContaining({ field: "currency" }));
    });
  });

  describe("overflow accounts with balances", () => {
    it("lists every account with its computed balance, ceiling and link", () => {
      const livretA = createAccount(db, {
        ...CHECKING_INPUT,
        name: "Livret A",
        kind: "savings",
        openingBalance: 100_000,
      });
      const livretJeune = createAccount(db, {
        ...CHECKING_INPUT,
        name: "Livret Jeune",
        kind: "savings",
        openingBalance: 150_000,
        depositCeiling: 160_000,
        overflowAccountId: livretA.id,
      });
      createTransaction(db, {
        accountId: livretJeune.id,
        date: "2026-02-01",
        amount: 5_000,
        kind: "interest",
        label: "Interest",
      });

      expect(listOverflowAccounts(db)).toEqual([
        {
          id: livretA.id,
          currency: "EUR",
          archived: false,
          balance: 100_000,
          ceiling: null,
          overflowAccountId: null,
        },
        {
          id: livretJeune.id,
          currency: "EUR",
          archived: false,
          balance: 155_000,
          ceiling: 160_000,
          overflowAccountId: livretA.id,
        },
      ]);
    });

    it("keeps archived accounts, flagged, since the chain is a graph", () => {
      const closed = createAccount(db, { ...CHECKING_INPUT, openingBalance: 0 });
      archiveAccount(db, closed.id, TODAY);

      expect(listOverflowAccounts(db)).toEqual([
        expect.objectContaining({ id: closed.id, archived: true, balance: 0 }),
      ]);
    });
  });

  describe("overflow accounts", () => {
    const SAVINGS_INPUT = { ...CHECKING_INPUT, kind: "savings", openingBalance: 0 };

    it("stores a deposit ceiling and an overflow account", () => {
      const livretA = createAccount(db, { ...SAVINGS_INPUT, name: "Livret A" });

      const livretJeune = createAccount(db, {
        ...SAVINGS_INPUT,
        name: "Livret Jeune",
        depositCeiling: 160_000,
        overflowAccountId: livretA.id,
      });

      expect(livretJeune).toMatchObject({
        depositCeiling: 160_000,
        overflowAccountId: livretA.id,
      });
    });

    it("refuses an overflow account in another currency", () => {
      const usd = createAccount(db, { ...SAVINGS_INPUT, currency: "USD" });

      expect(() =>
        createAccount(db, { ...SAVINGS_INPUT, overflowAccountId: usd.id }),
      ).toThrow(expect.objectContaining({ field: "overflowAccountId" }));
      expect(listAccounts(db)).toEqual([usd]);
    });

    it("refuses an archived overflow account", () => {
      const livretA = createAccount(db, SAVINGS_INPUT);
      archiveAccount(db, livretA.id, TODAY);

      expect(() =>
        createAccount(db, { ...SAVINGS_INPUT, overflowAccountId: livretA.id }),
      ).toThrow(expect.objectContaining({ field: "overflowAccountId" }));
    });

    it("refuses an update that would close a loop", () => {
      const livretA = createAccount(db, SAVINGS_INPUT);
      const livretJeune = createAccount(db, {
        ...SAVINGS_INPUT,
        overflowAccountId: livretA.id,
      });

      expect(() =>
        updateAccount(db, livretA.id, {
          ...SAVINGS_INPUT,
          overflowAccountId: livretJeune.id,
        }),
      ).toThrow(expect.objectContaining({ field: "overflowAccountId" }));
      expect(listAccounts(db)[0]?.overflowAccountId).toBeNull();
    });

    it("lets an account clear its overflow account", () => {
      const livretA = createAccount(db, SAVINGS_INPUT);
      const livretJeune = createAccount(db, {
        ...SAVINGS_INPUT,
        overflowAccountId: livretA.id,
      });

      const updated = updateAccount(db, livretJeune.id, {
        ...SAVINGS_INPUT,
        overflowAccountId: null,
      });

      expect(updated.overflowAccountId).toBeNull();
    });

    it("refuses to archive an account used as an overflow account", () => {
      const livretA = createAccount(db, SAVINGS_INPUT);
      createAccount(db, { ...SAVINGS_INPUT, overflowAccountId: livretA.id });

      expect(() => archiveAccount(db, livretA.id, TODAY)).toThrow(
        expect.objectContaining({ name: "AccountInUseError" }),
      );
      expect(listAccounts(db)).toHaveLength(2);
    });

    it("archives an account once its referrer no longer points to it", () => {
      const livretA = createAccount(db, SAVINGS_INPUT);
      const livretJeune = createAccount(db, {
        ...SAVINGS_INPUT,
        overflowAccountId: livretA.id,
      });
      updateAccount(db, livretJeune.id, SAVINGS_INPUT);

      archiveAccount(db, livretA.id, TODAY);

      expect(listAccounts(db).map((account) => account.id)).toEqual([livretJeune.id]);
    });

    it("makes the database itself refuse to delete a referenced account", () => {
      const livretA = createAccount(db, SAVINGS_INPUT);
      createAccount(db, { ...SAVINGS_INPUT, overflowAccountId: livretA.id });

      expect(() =>
        db.delete(accounts).where(eq(accounts.id, livretA.id)).run(),
      ).toThrow();
      expect(listAccounts(db)).toHaveLength(2);
    });

    it("refuses a currency change that would break a referrer's overflow link", () => {
      const livretA = createAccount(db, SAVINGS_INPUT);
      createAccount(db, { ...SAVINGS_INPUT, overflowAccountId: livretA.id });

      expect(() =>
        updateAccount(db, livretA.id, { ...SAVINGS_INPUT, currency: "USD" }),
      ).toThrow(expect.objectContaining({ field: "currency" }));
      expect(listAccounts(db)[0]?.currency).toBe("EUR");
    });

    it("lets an archived referrer release its overflow account", () => {
      const livretA = createAccount(db, SAVINGS_INPUT);
      const livretJeune = createAccount(db, {
        ...SAVINGS_INPUT,
        overflowAccountId: livretA.id,
      });
      archiveAccount(db, livretJeune.id, TODAY);

      expect(() => archiveAccount(db, livretA.id, TODAY)).not.toThrow();
    });
  });

  describe("archiving and planned items", () => {
    const EMPTY_INPUT = { ...CHECKING_INPUT, openingBalance: 0 };
    const ITEM = {
      name: "Rent",
      kind: "expense" as const,
      startDate: "2026-01-05",
      repetition: { kind: "monthly_on_day" as const, day: 5 },
      amount: -80_000,
    };

    it("refuses to archive an account targeted by a planned item that is not over", () => {
      const account = createAccount(db, EMPTY_INPUT);
      createPlannedItem(db, { ...ITEM, accountId: account.id });

      expect(() => archiveAccount(db, account.id, TODAY)).toThrow(
        expect.objectContaining({ name: "AccountInUseByPlannedItemError" }),
      );
      expect(listAccounts(db)).toHaveLength(1);
    });

    it("refuses to archive the destination account of a planned item that is not over", () => {
      const source = createAccount(db, EMPTY_INPUT);
      const destination = createAccount(db, { ...EMPTY_INPUT, name: "Savings" });
      createPlannedItem(db, {
        ...ITEM,
        kind: "transfer",
        accountId: source.id,
        destinationAccountId: destination.id,
      });

      expect(() => archiveAccount(db, destination.id, TODAY)).toThrow(
        expect.objectContaining({ name: "AccountInUseByPlannedItemError" }),
      );
    });

    it("archives once the item is cancelled", () => {
      const account = createAccount(db, EMPTY_INPUT);
      const item = createPlannedItem(db, { ...ITEM, accountId: account.id });
      db.update(plannedItems).set({ cancelled: true }).where(eq(plannedItems.id, item.id)).run();

      expect(() => archiveAccount(db, account.id, TODAY)).not.toThrow();
    });

    it("archives once the last occurrence is before today", () => {
      const account = createAccount(db, EMPTY_INPUT);
      createPlannedItem(db, { ...ITEM, accountId: account.id, endDate: "2026-03-05" });

      expect(() => archiveAccount(db, account.id, TODAY)).not.toThrow();
    });

    it("refuses while the last occurrence is on or after today", () => {
      const account = createAccount(db, EMPTY_INPUT);
      createPlannedItem(db, { ...ITEM, accountId: account.id, endDate: "2026-07-10" });

      expect(() => archiveAccount(db, account.id, TODAY)).toThrow(
        expect.objectContaining({ name: "AccountInUseByPlannedItemError" }),
      );
    });

    it("refuses while an item without end date is not cancelled", () => {
      const account = createAccount(db, EMPTY_INPUT);
      createPlannedItem(db, { ...ITEM, accountId: account.id, startDate: "2020-01-05" });

      expect(() => archiveAccount(db, account.id, TODAY)).toThrow(
        expect.objectContaining({ name: "AccountInUseByPlannedItemError" }),
      );
    });

    it("still refuses a non-zero balance first", () => {
      const account = createAccount(db, CHECKING_INPUT);
      createPlannedItem(db, { ...ITEM, accountId: account.id });

      expect(() => archiveAccount(db, account.id, TODAY)).toThrow(
        expect.objectContaining({ name: "AccountNotEmptyError" }),
      );
    });
  });
});
