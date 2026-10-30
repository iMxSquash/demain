import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { eq } from "drizzle-orm";

import { archiveAccount, createAccount } from "../../src/ledger/accounts";
import {
  createTransaction,
  createTransfer,
  listUncategorizedTransactions,
  setTransactionCategory,
  updateTransaction,
} from "../../src/ledger/transactions";
import { categories } from "../../src/storage/schema";
import {
  archiveCategory,
  createCategory,
  listCategories,
  reactivateCategory,
  renameCategory,
} from "../../src/ledger/categories";
import {
  type AppDatabase,
  migrateDatabase,
  openDatabase,
} from "../../src/storage/database";

describe("categories", () => {
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

  it("creates a category and lists it", () => {
    const created = createCategory(db, { name: " Groceries " });

    expect(created).toEqual({
      id: expect.any(Number),
      name: "Groceries",
      archived: false,
    });
    expect(listCategories(db)).toEqual([created]);
  });

  it("refuses a name that is already used, archived categories included", () => {
    const groceries = createCategory(db, { name: "Groceries" });
    archiveCategory(db, groceries.id);

    expect(() => createCategory(db, { name: "GROCERIES" })).toThrow(
      expect.objectContaining({ field: "name" }),
    );
    expect(listCategories(db, { includeArchived: true })).toHaveLength(1);
  });

  it("renames a category and lets it keep its own name in another case", () => {
    const category = createCategory(db, { name: "Groceries" });

    const renamed = renameCategory(db, category.id, { name: "GROCERIES" });
    const again = renameCategory(db, category.id, { name: "Food" });

    expect(renamed.name).toBe("GROCERIES");
    expect(again).toEqual({ ...category, name: "Food" });
  });

  it("makes the database itself refuse two names that differ only by case", () => {
    db.insert(categories).values({ name: "Rent" }).run();

    expect(() =>
      db.insert(categories).values({ name: "RENT" }).run(),
    ).toThrow();
    expect(listCategories(db, { includeArchived: true })).toHaveLength(1);
  });

  it("refuses to rename a category to the name of another one", () => {
    createCategory(db, { name: "Groceries" });
    const rent = createCategory(db, { name: "Rent" });

    expect(() => renameCategory(db, rent.id, { name: "groceries" })).toThrow(
      expect.objectContaining({ field: "name" }),
    );
    expect(listCategories(db)[1]?.name).toBe("Rent");
  });

  it("reports an unknown category instead of silently doing nothing", () => {
    expect(() => renameCategory(db, 999, { name: "Ghost" })).toThrow(
      expect.objectContaining({ name: "CategoryNotFoundError" }),
    );
    expect(() => archiveCategory(db, 999)).toThrow(
      expect.objectContaining({ name: "CategoryNotFoundError" }),
    );
  });

  it("hides an archived category from the default list but keeps it for history", () => {
    const groceries = createCategory(db, { name: "Groceries" });
    const rent = createCategory(db, { name: "Rent" });

    archiveCategory(db, groceries.id);

    expect(listCategories(db)).toEqual([rent]);
    expect(listCategories(db, { includeArchived: true })).toEqual([
      { ...groceries, archived: true },
      rent,
    ]);
  });

  it("offers a reactivated category again in the default list, in its original place", () => {
    const groceries = createCategory(db, { name: "Groceries" });
    const rent = createCategory(db, { name: "Rent" });
    archiveCategory(db, groceries.id);

    const reactivated = reactivateCategory(db, groceries.id);

    expect(reactivated).toEqual({ ...groceries, archived: false });
    expect(listCategories(db)).toEqual([groceries, rent]);
  });

  it("lets a reactivated category be picked again on a transaction", () => {
    const checking = createAccount(db, {
      name: "Checking",
      kind: "checking",
      currency: "EUR",
      openingDate: "2026-01-01",
      openingBalance: 0,
    });
    const groceries = createCategory(db, { name: "Groceries" });
    const waiting = createTransaction(db, {
      accountId: checking.id,
      date: "2026-02-10",
      amount: -1_250,
      kind: "expense",
      label: "Shop",
    });
    archiveCategory(db, groceries.id);
    reactivateCategory(db, groceries.id);

    const categorized = setTransactionCategory(db, waiting.id, groceries.id);

    expect(categorized.categoryId).toBe(groceries.id);
  });

  it("keeps the name of a reactivated category unique without conflict", () => {
    const groceries = createCategory(db, { name: "Groceries" });
    archiveCategory(db, groceries.id);

    reactivateCategory(db, groceries.id);

    expect(() => createCategory(db, { name: "groceries" })).toThrow(
      expect.objectContaining({ field: "name" }),
    );
    expect(listCategories(db, { includeArchived: true })).toHaveLength(1);
  });

  it("treats reactivating an active category as a no-op", () => {
    const groceries = createCategory(db, { name: "Groceries" });

    expect(reactivateCategory(db, groceries.id)).toEqual(groceries);
  });

  it("reports an unknown category on reactivation", () => {
    expect(() => reactivateCategory(db, 999)).toThrow(
      expect.objectContaining({ name: "CategoryNotFoundError" }),
    );
  });

  describe("categorizing transactions", () => {
    const ACCOUNT_INPUT = {
      name: "Checking",
      kind: "checking",
      currency: "EUR",
      openingDate: "2026-01-01",
      openingBalance: 100_000,
    };
    const entry = (accountId: number, overrides = {}) => ({
      accountId,
      date: "2026-02-10",
      amount: -1_250,
      kind: "expense" as const,
      label: "Groceries",
      ...overrides,
    });

    it("stores the category given when a transaction is recorded", () => {
      const checking = createAccount(db, ACCOUNT_INPUT);
      const groceries = createCategory(db, { name: "Groceries" });

      const created = createTransaction(
        db,
        entry(checking.id, { categoryId: groceries.id }),
      );

      expect(created.categoryId).toBe(groceries.id);
    });

    it("refuses an unknown or archived category on a new transaction", () => {
      const checking = createAccount(db, ACCOUNT_INPUT);
      const old = createCategory(db, { name: "Old" });
      archiveCategory(db, old.id);

      expect(() =>
        createTransaction(db, entry(checking.id, { categoryId: 999 })),
      ).toThrow(expect.objectContaining({ name: "CategoryNotFoundError" }));
      expect(() =>
        createTransaction(db, entry(checking.id, { categoryId: old.id })),
      ).toThrow(expect.objectContaining({ field: "categoryId" }));
    });

    it("queues only the entered transactions that have no category", () => {
      const checking = createAccount(db, ACCOUNT_INPUT);
      const savings = createAccount(db, { ...ACCOUNT_INPUT, name: "Livret A" });
      const groceries = createCategory(db, { name: "Groceries" });
      const waiting = createTransaction(db, entry(checking.id));
      createTransaction(db, entry(checking.id, { categoryId: groceries.id }));
      createTransfer(db, {
        sourceId: checking.id,
        destinationId: savings.id,
        amount: 500,
        date: "2026-02-11",
        label: "Savings",
      });

      expect(listUncategorizedTransactions(db)).toEqual([waiting]);
    });

    it("assigns then clears the category of a transaction", () => {
      const checking = createAccount(db, ACCOUNT_INPUT);
      const groceries = createCategory(db, { name: "Groceries" });
      const waiting = createTransaction(db, entry(checking.id));

      const assigned = setTransactionCategory(db, waiting.id, groceries.id);
      const cleared = setTransactionCategory(db, waiting.id, null);

      expect(assigned.categoryId).toBe(groceries.id);
      expect(cleared.categoryId).toBeNull();
      expect(listUncategorizedTransactions(db)).toEqual([cleared]);
    });

    it("refuses a category on a transfer leg and an archived category", () => {
      const checking = createAccount(db, ACCOUNT_INPUT);
      const savings = createAccount(db, { ...ACCOUNT_INPUT, name: "Livret A" });
      const groceries = createCategory(db, { name: "Groceries" });
      const old = createCategory(db, { name: "Old" });
      archiveCategory(db, old.id);
      const [leg] = createTransfer(db, {
        sourceId: checking.id,
        destinationId: savings.id,
        amount: 500,
        date: "2026-02-11",
        label: "Savings",
      });
      const waiting = createTransaction(db, entry(checking.id));

      expect(() => setTransactionCategory(db, leg.id, groceries.id)).toThrow(
        expect.objectContaining({ field: "categoryId" }),
      );
      expect(() => setTransactionCategory(db, waiting.id, old.id)).toThrow(
        expect.objectContaining({ field: "categoryId" }),
      );
    });

    it("keeps an archived category on an edited transaction but refuses to pick it again", () => {
      const checking = createAccount(db, ACCOUNT_INPUT);
      const old = createCategory(db, { name: "Old" });
      const other = createCategory(db, { name: "Other" });
      const created = createTransaction(
        db,
        entry(checking.id, { categoryId: old.id }),
      );
      archiveCategory(db, old.id);

      const edited = updateTransaction(
        db,
        created.id,
        entry(checking.id, { amount: -2_000, categoryId: old.id }),
      );
      const moved = updateTransaction(
        db,
        created.id,
        entry(checking.id, { categoryId: other.id }),
      );

      expect(edited).toMatchObject({ amount: -2_000, categoryId: old.id });
      expect(moved.categoryId).toBe(other.id);
      expect(() =>
        updateTransaction(db, created.id, entry(checking.id, { categoryId: old.id })),
      ).toThrow(expect.objectContaining({ field: "categoryId" }));
    });

    it("categorizes a transaction of an archived account, since its balance is untouched", () => {
      const closing = createAccount(db, { ...ACCOUNT_INPUT, openingBalance: 0 });
      const other = createAccount(db, { ...ACCOUNT_INPUT, name: "Other" });
      const groceries = createCategory(db, { name: "Groceries" });
      const income = createTransaction(
        db,
        entry(closing.id, { amount: 700, kind: "income", label: "Refund" }),
      );
      createTransfer(db, {
        sourceId: closing.id,
        destinationId: other.id,
        amount: 700,
        date: "2026-02-12",
        label: "Empty it",
      });
      archiveAccount(db, closing.id);

      const categorized = setTransactionCategory(db, income.id, groceries.id);

      expect(categorized.categoryId).toBe(groceries.id);
    });

    it("keeps the category of its transactions when a category is archived, and refuses its deletion", () => {
      const checking = createAccount(db, ACCOUNT_INPUT);
      const groceries = createCategory(db, { name: "Groceries" });
      const created = createTransaction(
        db,
        entry(checking.id, { categoryId: groceries.id }),
      );

      archiveCategory(db, groceries.id);

      expect(listUncategorizedTransactions(db)).toEqual([]);
      expect(created.categoryId).toBe(groceries.id);
      expect(() =>
        db.delete(categories).where(eq(categories.id, groceries.id)).run(),
      ).toThrow();
    });
  });
});
