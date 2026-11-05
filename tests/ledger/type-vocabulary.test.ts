import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createAccount } from "../../src/ledger/accounts";
import { createCategory } from "../../src/ledger/categories";
import { commitImport } from "../../src/ledger/imports";
import { createTransaction } from "../../src/ledger/transactions";
import {
  getTypeVocabulary,
  getVocabularyOverview,
  removeVocabularyWord,
  restoreVocabularyWord,
  setVocabularyWord,
  VocabularyValidationError,
} from "../../src/ledger/type-vocabulary";
import {
  type AppDatabase,
  migrateDatabase,
  openDatabase,
} from "../../src/storage/database";
import { settings } from "../../src/storage/schema";

const NOW = new Date("2026-04-15T10:00:00Z");

describe("the type vocabulary", () => {
  let dataDir: string;
  let db: AppDatabase;
  let accountId: number;

  beforeEach(() => {
    dataDir = mkdtempSync(path.join(tmpdir(), "demain-test-"));
    db = openDatabase(dataDir);
    migrateDatabase(db);
    accountId = createAccount(db, {
      name: "Checking",
      kind: "checking",
      currency: "EUR",
      openingDate: "2026-01-01",
      openingBalance: 0,
    }).id;
  });

  afterEach(() => {
    db.$client.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  // The categories an earlier import confirmed: its rows carry them, as does a manual entry.
  function importWithCategory(categoryName: string, amount: number): void {
    const category = createCategory(db, { name: categoryName });
    commitImport(db, {
      accountId,
      rows: [
        {
          date: "2026-03-10",
          amount,
          label: `Row ${categoryName}`,
          externalId: null,
          details: {
            type: amount < 0 ? "expense" : "income",
            categoryId: category.id,
            paymentMode: null,
            description: null,
            savingsAccountId: null,
          },
        },
      ],
      format: "csv",
      fileName: `${categoryName}.csv`,
      mapping: null,
      now: NOW,
    });
  }

  it("is the fixed vocabulary on a new database", () => {
    const vocabulary = getTypeVocabulary(db);

    expect(vocabulary.get("salaire")).toEqual({ type: "income", origin: "fixed" });
    expect(vocabulary.get("epargne")).toEqual({ type: "savings", origin: "fixed" });
    expect(getVocabularyOverview(db).removed).toEqual([]);
  });

  it("learns the categories of the earlier imports, with their type", () => {
    importWithCategory("Prime", 50_000);
    importWithCategory("Courses", -2_000);

    const vocabulary = getTypeVocabulary(db);

    expect(vocabulary.get("prime")).toEqual({ type: "income", origin: "history" });
    expect(vocabulary.get("courses")).toEqual({ type: "expense", origin: "history" });
  });

  it("does not learn from a transaction entered by hand", () => {
    const category = createCategory(db, { name: "Cadeaux" });
    createTransaction(db, {
      accountId,
      date: "2026-03-10",
      amount: -1_000,
      kind: "expense",
      label: "Gift",
      categoryId: category.id,
    });

    expect(getTypeVocabulary(db).has("cadeaux")).toBe(false);
  });

  it("keeps the fixed word when an import used its category with another type", () => {
    importWithCategory("Salaire", -1_000);

    expect(getTypeVocabulary(db).get("salaire")).toEqual({ type: "income", origin: "fixed" });
  });

  it("saves a word of the user and reads it again", () => {
    setVocabularyWord(db, { word: "  Bonus ", type: "income" });

    expect(getTypeVocabulary(db).get("bonus")).toEqual({ type: "income", origin: "user" });
  });

  it("keeps the words of the user after the database is opened again", () => {
    setVocabularyWord(db, { word: "bonus", type: "income" });
    db.$client.close();

    db = openDatabase(dataDir);

    expect(getTypeVocabulary(db).get("bonus")).toEqual({ type: "income", origin: "user" });
  });

  it("changes the type of a fixed word", () => {
    setVocabularyWord(db, { word: "salaire", type: "savings" });

    expect(getTypeVocabulary(db).get("salaire")).toEqual({ type: "savings", origin: "user" });
  });

  it("replaces an earlier choice for the same word", () => {
    setVocabularyWord(db, { word: "bonus", type: "income" });
    setVocabularyWord(db, { word: "BONUS", type: "savings" });

    expect(getTypeVocabulary(db).get("bonus")).toEqual({ type: "savings", origin: "user" });
  });

  it("removes a fixed word and lists it as removed until it is restored", () => {
    removeVocabularyWord(db, "livret");

    expect(getTypeVocabulary(db).has("livret")).toBe(false);
    expect(getVocabularyOverview(db).removed).toEqual(["livret"]);

    restoreVocabularyWord(db, "livret");

    expect(getTypeVocabulary(db).get("livret")).toEqual({ type: "savings", origin: "fixed" });
    expect(getVocabularyOverview(db).removed).toEqual([]);
  });

  it("forgets a word that only the user knew instead of listing it as removed", () => {
    setVocabularyWord(db, { word: "bonus", type: "income" });

    removeVocabularyWord(db, "bonus");

    expect(getTypeVocabulary(db).has("bonus")).toBe(false);
    expect(getVocabularyOverview(db).removed).toEqual([]);
  });

  it("removes a word learned from the history", () => {
    importWithCategory("Prime", 50_000);

    removeVocabularyWord(db, "prime");

    expect(getTypeVocabulary(db).has("prime")).toBe(false);
    expect(getVocabularyOverview(db).removed).toEqual(["prime"]);
  });

  it("lists the words with their origin, in alphabetical order", () => {
    setVocabularyWord(db, { word: "bonus", type: "income" });
    importWithCategory("Prime", 50_000);

    const { words } = getVocabularyOverview(db);

    expect(words.map(({ word }) => word)).toEqual([...words.map(({ word }) => word)].sort());
    expect(words).toContainEqual({ word: "bonus", type: "income", origin: "user" });
    expect(words).toContainEqual({ word: "prime", type: "income", origin: "history" });
    expect(words).toContainEqual({ word: "salaire", type: "income", origin: "fixed" });
  });

  describe("refuses what is not a word and a type", () => {
    it.each([
      ["an empty word", { word: "  ", type: "income" }, "word"],
      ["two words", { word: "two words", type: "income" }, "word"],
      ["a word that is too long", { word: "a".repeat(41), type: "income" }, "word"],
      ["a word that is not text", { word: 12, type: "income" }, "word"],
      ["an unknown type", { word: "bonus", type: "gift" }, "type"],
      ["a missing type", { word: "bonus" }, "type"],
      ["a prototype key as a type", { word: "bonus", type: "__proto__" }, "type"],
    ])("%s", (_name, input, field) => {
      let error: unknown = null;
      try {
        setVocabularyWord(db, input as never);
      } catch (caught) {
        error = caught;
      }

      expect(error).toBeInstanceOf(VocabularyValidationError);
      expect((error as VocabularyValidationError).field).toBe(field);
      expect(getVocabularyOverview(db).removed).toEqual([]);
      expect(db.select().from(settings).all()).toEqual([]);
    });

    it("on removal", () => {
      expect(() => removeVocabularyWord(db, "two words")).toThrow(VocabularyValidationError);
    });
  });

  it("refuses to read stored choices that were tampered with", () => {
    db.insert(settings)
      .values({ key: "type_vocabulary_overrides", value: '{"bonus":"gift"}' })
      .run();

    expect(() => getTypeVocabulary(db)).toThrow();
  });

  it("does not let a word named like a prototype key reach Object.prototype", () => {
    setVocabularyWord(db, { word: "constructor", type: "income" });

    expect(getTypeVocabulary(db).get("constructor")).toEqual({ type: "income", origin: "user" });
    expect(({} as Record<string, unknown>)["constructor"]).toBe(Object);
  });
});
