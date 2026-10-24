import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { at } from "../auth/at";
import { createAccount } from "../../src/ledger/accounts";
import { createCategory } from "../../src/ledger/categories";
import {
  createRule,
  deleteRule,
  listRules,
  moveRule,
} from "../../src/ledger/categorization-rules";
import {
  createTransaction,
  listUncategorizedTransactions,
  setTransactionCategory,
} from "../../src/ledger/transactions";
import {
  type AppDatabase,
  migrateDatabase,
  openDatabase,
} from "../../src/storage/database";

describe("categorization rules", () => {
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

  it("creates rules and lists them in priority order, the newest last", () => {
    const groceries = createCategory(db, { name: "Groceries" });
    const leisure = createCategory(db, { name: "Leisure" });

    const first = createRule(db, {
      operator: "contains",
      value: " carrefour ",
      categoryId: groceries.id,
    });
    const second = createRule(db, {
      operator: "equals",
      value: "Netflix",
      categoryId: leisure.id,
    });

    expect(first).toEqual({
      id: expect.any(Number),
      operator: "contains",
      value: "carrefour",
      accountId: null,
      categoryId: groceries.id,
      priority: 1,
    });
    expect(second.priority).toBe(2);
    expect(listRules(db).map((rule) => rule.id)).toEqual([first.id, second.id]);
  });

  it("moves a rule up or down by swapping it with its neighbour", () => {
    const category = createCategory(db, { name: "Groceries" });
    const rules = ["a", "b", "c"].map((value) =>
      createRule(db, { operator: "contains", value, categoryId: category.id }),
    );
    const [a, b, c] = [at(rules, 0), at(rules, 1), at(rules, 2)];

    moveRule(db, c.id, "up");
    expect(listRules(db).map((rule) => rule.id)).toEqual([a.id, c.id, b.id]);

    moveRule(db, a.id, "down");
    expect(listRules(db).map((rule) => rule.id)).toEqual([c.id, a.id, b.id]);
  });

  it("leaves the order unchanged when the first rule moves up", () => {
    const category = createCategory(db, { name: "Groceries" });
    const rules = ["a", "b"].map((value) =>
      createRule(db, { operator: "contains", value, categoryId: category.id }),
    );
    const [a, b] = [at(rules, 0), at(rules, 1)];

    moveRule(db, a.id, "up");

    expect(listRules(db).map((rule) => rule.id)).toEqual([a.id, b.id]);
  });

  it("deletes a rule and keeps the others in order", () => {
    const category = createCategory(db, { name: "Groceries" });
    const rules = ["a", "b", "c"].map((value) =>
      createRule(db, { operator: "contains", value, categoryId: category.id }),
    );

    deleteRule(db, at(rules, 1).id);

    expect(listRules(db).map((rule) => rule.id)).toEqual([
      at(rules, 0).id,
      at(rules, 2).id,
    ]);
  });

  describe("categorizing with a rule", () => {
    function setup() {
      const account = createAccount(db, {
        name: "Checking",
        kind: "checking",
        currency: "EUR",
        openingDate: "2026-01-01",
        openingBalance: 0,
      });
      const category = createCategory(db, { name: "Groceries" });
      const transaction = createTransaction(db, {
        accountId: account.id,
        date: "2026-02-10",
        amount: -1_250,
        kind: "expense",
        label: "CARD SHOP PARIS",
      });
      return { category, transaction };
    }

    it("categorizes the transaction and records the rule together", () => {
      const { category, transaction } = setup();

      const updated = setTransactionCategory(db, transaction.id, category.id, {
        rule: { operator: "contains", value: " shop " },
      });

      expect(updated.categoryId).toBe(category.id);
      expect(listRules(db)).toEqual([
        {
          id: expect.any(Number),
          operator: "contains",
          value: "shop",
          accountId: null,
          categoryId: category.id,
          priority: 1,
        },
      ]);
    });

    it("leaves the transaction in the queue when the rule cannot be stored", () => {
      const { category, transaction } = setup();
      db.$client.exec("DROP TABLE categorization_rules");

      expect(() =>
        setTransactionCategory(db, transaction.id, category.id, {
          rule: { operator: "contains", value: "shop" },
        }),
      ).toThrow();

      expect(listUncategorizedTransactions(db).map((t) => t.id)).toEqual([
        transaction.id,
      ]);
    });
  });
});
