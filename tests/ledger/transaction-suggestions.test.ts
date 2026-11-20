import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { archiveAccount, createAccount, type Account } from "../../src/ledger/accounts";
import { archiveCategory, createCategory } from "../../src/ledger/categories";
import { createRule } from "../../src/ledger/categorization-rules";
import { createTransaction, createTransfer } from "../../src/ledger/transactions";
import {
  getLastUsedAccountId,
  listLabelSuggestions,
} from "../../src/ledger/transaction-suggestions";
import { type AppDatabase, migrateDatabase, openDatabase } from "../../src/storage/database";

function accountInput(name: string, openingBalance = 100_000) {
  return {
    name,
    kind: "checking",
    currency: "EUR",
    openingDate: "2026-01-01",
    openingBalance,
  };
}

describe("transaction suggestions", () => {
  let dataDir: string;
  let db: AppDatabase;
  let checking: Account;
  let savings: Account;

  beforeEach(() => {
    dataDir = mkdtempSync(path.join(tmpdir(), "demain-test-"));
    db = openDatabase(dataDir);
    migrateDatabase(db);
    checking = createAccount(db, accountInput("Checking"));
    savings = createAccount(db, accountInput("Savings"));
  });

  afterEach(() => {
    db.$client.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  function spend(label: string, date: string, accountId = checking.id) {
    createTransaction(db, { accountId, date, amount: -500, kind: "expense", label });
  }

  describe("label suggestions", () => {
    it("lists each label once, the most used first", () => {
      spend("Bakery", "2026-02-01");
      spend("Groceries", "2026-02-02");
      spend("Groceries", "2026-02-09");
      spend("Groceries", "2026-02-16");
      spend("Bakery", "2026-02-20");

      const labels = listLabelSuggestions(db, [checking.id]).map(({ label }) => label);

      expect(labels).toEqual(["Groceries", "Bakery"]);
    });

    it("breaks a tie by the most recent use", () => {
      spend("Old habit", "2026-01-05");
      spend("Fresh habit", "2026-03-05");

      const labels = listLabelSuggestions(db, [checking.id]).map(({ label }) => label);

      expect(labels).toEqual(["Fresh habit", "Old habit"]);
    });

    it("leaves out the labels of transfers", () => {
      spend("Bakery", "2026-02-01");
      createTransfer(db, {
        sourceId: checking.id,
        destinationId: savings.id,
        amount: 1_000,
        date: "2026-02-02",
        label: "Monthly saving",
      });

      const labels = listLabelSuggestions(db, [checking.id]).map(({ label }) => label);

      expect(labels).toEqual(["Bakery"]);
    });

    it("keeps at most the requested number of labels", () => {
      for (const label of ["A", "B", "C"]) spend(label, "2026-02-01");

      expect(listLabelSuggestions(db, [checking.id], 2)).toHaveLength(2);
    });

    it("is empty without history", () => {
      expect(listLabelSuggestions(db, [checking.id])).toEqual([]);
    });
  });

  describe("category through the categorization rules", () => {
    it("gives the category the first matching rule picks for each account", () => {
      const groceries = createCategory(db, { name: "Groceries" });
      const leisure = createCategory(db, { name: "Leisure" });
      createRule(db, { operator: "contains", value: "market", categoryId: groceries.id });
      createRule(db, {
        operator: "contains",
        value: "market",
        accountId: savings.id,
        categoryId: leisure.id,
      });
      spend("Corner Market", "2026-02-01");

      const [suggestion] = listLabelSuggestions(db, [checking.id, savings.id]);

      expect(suggestion?.categoryByAccount).toEqual({
        [checking.id]: groceries.id,
        [savings.id]: groceries.id,
      });
    });

    it("applies a rule that is limited to an account only to that account", () => {
      const leisure = createCategory(db, { name: "Leisure" });
      createRule(db, {
        operator: "equals",
        value: "cinema",
        accountId: savings.id,
        categoryId: leisure.id,
      });
      spend("Cinema", "2026-02-01");

      const [suggestion] = listLabelSuggestions(db, [checking.id, savings.id]);

      expect(suggestion?.categoryByAccount).toEqual({ [savings.id]: leisure.id });
    });

    it("gives no category when no rule matches", () => {
      spend("Bakery", "2026-02-01");

      const [suggestion] = listLabelSuggestions(db, [checking.id]);

      expect(suggestion?.categoryByAccount).toEqual({});
    });

    it("skips a rule that points to an archived category", () => {
      const old = createCategory(db, { name: "Old" });
      createRule(db, { operator: "contains", value: "bakery", categoryId: old.id });
      archiveCategory(db, old.id);
      spend("Bakery", "2026-02-01");

      const [suggestion] = listLabelSuggestions(db, [checking.id]);

      expect(suggestion?.categoryByAccount).toEqual({});
    });
  });

  describe("last account used", () => {
    it("is null without any transaction", () => {
      expect(getLastUsedAccountId(db)).toBeNull();
    });

    it("is the account of the transaction entered last, whatever its date", () => {
      spend("Recent date", "2026-03-01", checking.id);
      spend("Back-dated entry", "2026-01-15", savings.id);

      expect(getLastUsedAccountId(db)).toBe(savings.id);
    });

    it("ignores transfers", () => {
      spend("Bakery", "2026-02-01", checking.id);
      createTransfer(db, {
        sourceId: checking.id,
        destinationId: savings.id,
        amount: 1_000,
        date: "2026-02-02",
        label: "Monthly saving",
      });

      expect(getLastUsedAccountId(db)).toBe(checking.id);
    });

    it("ignores an archived account", () => {
      const closed = createAccount(db, accountInput("Closed", 0));
      createTransaction(db, {
        accountId: closed.id,
        date: "2026-02-01",
        amount: 500,
        kind: "income",
        label: "Refund",
      });
      spend("Bakery", "2026-02-02", checking.id);
      spend("Last meal", "2026-02-03", closed.id);
      archiveAccount(db, closed.id, "2026-06-15");

      expect(getLastUsedAccountId(db)).toBe(checking.id);
    });
  });
});
