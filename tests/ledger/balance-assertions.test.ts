import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  AccountNotFoundError,
  archiveAccount,
  createAccount,
} from "../../src/ledger/accounts";
import {
  BalanceAssertionNotFoundError,
  BalanceAssertionOnArchivedAccountError,
  deleteBalanceAssertion,
  listAllBalanceAssertions,
  listAssertionSnapshots,
  listBalanceAssertions,
  saveBalanceAssertion,
} from "../../src/ledger/balance-assertions";
import { createTransaction } from "../../src/ledger/transactions";
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
  openingBalance: 5627,
};

describe("balance assertions", () => {
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

  it("records an assertion and lists it with its unexplained gap", () => {
    const checking = createAccount(db, CHECKING_INPUT);
    createTransaction(db, {
      accountId: checking.id,
      date: "2026-01-10",
      amount: -1000,
      kind: "expense",
      label: "Groceries",
    });

    saveBalanceAssertion(db, {
      accountId: checking.id,
      date: "2026-01-31",
      amount: 4427,
      note: "bank site",
    });

    expect(listBalanceAssertions(db, checking.id)).toEqual([
      {
        id: expect.any(Number),
        accountId: checking.id,
        date: "2026-01-31",
        amount: 4427,
        note: "bank site",
        computedBalance: 4627,
        gap: 200,
      },
    ]);
  });

  it("replaces the assertion of the same account and date", () => {
    const checking = createAccount(db, CHECKING_INPUT);
    saveBalanceAssertion(db, { accountId: checking.id, date: "2026-01-31", amount: 100 });

    saveBalanceAssertion(db, { accountId: checking.id, date: "2026-01-31", amount: 5627 });

    const assertions = listBalanceAssertions(db, checking.id);
    expect(assertions).toHaveLength(1);
    expect(assertions[0]).toMatchObject({ amount: 5627, gap: 0 });
  });

  it("tells whether the assertion replaced an earlier one", () => {
    const checking = createAccount(db, CHECKING_INPUT);
    const savings = createAccount(db, { ...CHECKING_INPUT, name: "Livret A", kind: "savings" });

    const first = saveBalanceAssertion(db, { accountId: checking.id, date: "2026-01-31", amount: 100 });
    const again = saveBalanceAssertion(db, { accountId: checking.id, date: "2026-01-31", amount: 200 });
    const otherDay = saveBalanceAssertion(db, { accountId: checking.id, date: "2026-02-28", amount: 200 });
    const otherAccount = saveBalanceAssertion(db, { accountId: savings.id, date: "2026-01-31", amount: 200 });

    expect([first, again, otherDay, otherAccount].map((saved) => saved.replaced)).toEqual([
      false,
      true,
      false,
      false,
    ]);
    expect(again).toMatchObject({ id: first.id, amount: 200 });
  });

  it("lists the most recent assertion first and only those of the account", () => {
    const checking = createAccount(db, CHECKING_INPUT);
    const savings = createAccount(db, { ...CHECKING_INPUT, name: "Livret A", kind: "savings" });
    saveBalanceAssertion(db, { accountId: checking.id, date: "2026-01-31", amount: 5627 });
    saveBalanceAssertion(db, { accountId: checking.id, date: "2026-02-28", amount: 5627 });
    saveBalanceAssertion(db, { accountId: savings.id, date: "2026-02-28", amount: 5627 });

    const dates = listBalanceAssertions(db, checking.id).map((entry) => entry.date);

    expect(dates).toEqual(["2026-02-28", "2026-01-31"]);
  });

  it("rejects a date before the opening of the account", () => {
    const checking = createAccount(db, CHECKING_INPUT);

    expect(() =>
      saveBalanceAssertion(db, { accountId: checking.id, date: "2025-12-31", amount: 0 }),
    ).toThrow(expect.objectContaining({ field: "date" }));
    expect(listBalanceAssertions(db, checking.id)).toEqual([]);
  });

  it("rejects an assertion on an unknown account", () => {
    expect(() =>
      saveBalanceAssertion(db, { accountId: 999, date: "2026-01-31", amount: 0 }),
    ).toThrow(AccountNotFoundError);
  });

  describe("listAssertionSnapshots", () => {
    it("lists the assertions of the active accounts only, oldest first", () => {
      const active = createAccount(db, CHECKING_INPUT);
      const closed = createAccount(db, { ...CHECKING_INPUT, name: "Old", openingBalance: 0 });
      const later = saveBalanceAssertion(db, { accountId: active.id, date: "2026-02-28", amount: 5627 });
      const earlier = saveBalanceAssertion(db, { accountId: active.id, date: "2026-01-31", amount: 5000 });
      saveBalanceAssertion(db, { accountId: closed.id, date: "2026-01-31", amount: 0 });
      archiveAccount(db, closed.id);

      expect(listAssertionSnapshots(db)).toEqual([
        { id: earlier.id, accountId: active.id, date: "2026-01-31", amount: 5000 },
        { id: later.id, accountId: active.id, date: "2026-02-28", amount: 5627 },
      ]);
    });

    it("is empty without any assertion", () => {
      createAccount(db, CHECKING_INPUT);

      expect(listAssertionSnapshots(db)).toEqual([]);
    });
  });

  describe("listAllBalanceAssertions", () => {
    it("lists the assertions of every account with their gap, most recent first", () => {
      const checking = createAccount(db, CHECKING_INPUT);
      const savings = createAccount(db, {
        ...CHECKING_INPUT,
        name: "Livret A",
        kind: "savings",
        openingBalance: 1000,
      });
      createTransaction(db, {
        accountId: checking.id,
        date: "2026-01-10",
        amount: -1000,
        kind: "expense",
        label: "Groceries",
      });
      saveBalanceAssertion(db, { accountId: checking.id, date: "2026-01-31", amount: 4427 });
      saveBalanceAssertion(db, { accountId: savings.id, date: "2026-02-28", amount: 1000 });

      const all = listAllBalanceAssertions(db);

      expect(all.map((entry) => [entry.accountId, entry.date, entry.gap])).toEqual([
        [savings.id, "2026-02-28", 0],
        [checking.id, "2026-01-31", 200],
      ]);
      expect(all[1]).toMatchObject({ computedBalance: 4627, amount: 4427 });
    });

    it("marks the assertions of an archived account as archived", () => {
      const active = createAccount(db, CHECKING_INPUT);
      const closed = createAccount(db, { ...CHECKING_INPUT, name: "Old", openingBalance: 0 });
      saveBalanceAssertion(db, { accountId: active.id, date: "2026-01-31", amount: 5627 });
      saveBalanceAssertion(db, { accountId: closed.id, date: "2026-01-31", amount: 0 });
      archiveAccount(db, closed.id);

      const byAccount = new Map(
        listAllBalanceAssertions(db).map((entry) => [entry.accountId, entry]),
      );

      expect(byAccount.get(active.id)).toMatchObject({ accountName: "Checking", accountArchived: false });
      expect(byAccount.get(closed.id)).toMatchObject({ accountName: "Old", accountArchived: true });
    });

    it("is empty without any assertion", () => {
      createAccount(db, CHECKING_INPUT);

      expect(listAllBalanceAssertions(db)).toEqual([]);
    });
  });

  describe("archived accounts", () => {
    function archivedWithAssertion() {
      const account = createAccount(db, { ...CHECKING_INPUT, openingBalance: 0 });
      saveBalanceAssertion(db, { accountId: account.id, date: "2026-01-31", amount: 0 });
      archiveAccount(db, account.id);
      return account;
    }

    it("refuses a new assertion, like a transaction", () => {
      const account = archivedWithAssertion();

      expect(() =>
        saveBalanceAssertion(db, { accountId: account.id, date: "2026-02-28", amount: 0 }),
      ).toThrow(BalanceAssertionOnArchivedAccountError);
      expect(listBalanceAssertions(db, account.id)).toHaveLength(1);
    });

    it("refuses to replace an assertion of the same day", () => {
      const account = archivedWithAssertion();

      expect(() =>
        saveBalanceAssertion(db, { accountId: account.id, date: "2026-01-31", amount: 5 }),
      ).toThrow(BalanceAssertionOnArchivedAccountError);
      expect(listBalanceAssertions(db, account.id)[0]).toMatchObject({ amount: 0 });
    });

    it("refuses to delete an assertion", () => {
      const account = archivedWithAssertion();
      const [assertion] = listBalanceAssertions(db, account.id);

      expect(() => deleteBalanceAssertion(db, account.id, assertion!.id)).toThrow(
        BalanceAssertionOnArchivedAccountError,
      );
      expect(listBalanceAssertions(db, account.id)).toHaveLength(1);
    });

    it("keeps the assertions recorded before the archiving", () => {
      const account = archivedWithAssertion();

      expect(listBalanceAssertions(db, account.id)).toEqual([
        expect.objectContaining({ date: "2026-01-31", gap: 0 }),
      ]);
    });
  });

  it("deletes an assertion", () => {
    const checking = createAccount(db, CHECKING_INPUT);
    const saved = saveBalanceAssertion(db, {
      accountId: checking.id,
      date: "2026-01-31",
      amount: 5627,
    });

    deleteBalanceAssertion(db, checking.id, saved.id);

    expect(listBalanceAssertions(db, checking.id)).toEqual([]);
  });

  it("fails to delete an unknown assertion", () => {
    const checking = createAccount(db, CHECKING_INPUT);

    expect(() => deleteBalanceAssertion(db, checking.id, 999)).toThrow(
      BalanceAssertionNotFoundError,
    );
  });

  it("refuses to delete an assertion through another account", () => {
    const checking = createAccount(db, CHECKING_INPUT);
    const savings = createAccount(db, { ...CHECKING_INPUT, name: "Livret A", kind: "savings" });
    saveBalanceAssertion(db, { accountId: checking.id, date: "2026-01-31", amount: 5627 });
    const ofSavings = saveBalanceAssertion(db, {
      accountId: savings.id,
      date: "2026-01-31",
      amount: 5627,
    });

    expect(() => deleteBalanceAssertion(db, checking.id, ofSavings.id)).toThrow(
      BalanceAssertionNotFoundError,
    );
    expect(listBalanceAssertions(db, checking.id)).toHaveLength(1);
    expect(listBalanceAssertions(db, savings.id)).toHaveLength(1);
  });
});
