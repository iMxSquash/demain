import { describe, expect, it } from "vitest";

import { DEFAULT_TYPE_VOCABULARY, findTypeWord } from "../../src/domain/import-guess";
import {
  buildTypeVocabulary,
  normalizeVocabularyWord,
  type HistoryCategory,
  type VocabularyOverride,
} from "../../src/domain/type-vocabulary";
import historyFixture from "../fixtures/type-vocabulary-history.json";

const HISTORY = historyFixture as HistoryCategory[];

const build = (history: HistoryCategory[] = [], overrides: VocabularyOverride[] = []) =>
  buildTypeVocabulary({ fixed: DEFAULT_TYPE_VOCABULARY, history, overrides });

describe("buildTypeVocabulary", () => {
  it("is the fixed vocabulary when there is no history and no override", () => {
    expect(build()).toEqual(DEFAULT_TYPE_VOCABULARY);
  });

  it("adds a word of the history that the fixed vocabulary does not know", () => {
    const vocabulary = build(HISTORY);

    expect(vocabulary.get("prime")).toEqual({ type: "income", origin: "history" });
    expect(vocabulary.get("courses")).toEqual({ type: "expense", origin: "history" });
  });

  it("lets the fixed vocabulary win when the history disagrees", () => {
    const vocabulary = build(HISTORY);

    expect(vocabulary.get("salaire")).toEqual({ type: "income", origin: "fixed" });
  });

  it("ignores a word of the history that has been recorded with two types", () => {
    expect(build(HISTORY).has("remboursement")).toBe(false);
  });

  it("takes the words of a category made of one word only", () => {
    const vocabulary = build(HISTORY);

    expect(vocabulary.has("frais")).toBe(false);
    expect(vocabulary.has("de")).toBe(false);
    expect(vocabulary.has("sante")).toBe(false);
  });

  it("reads the words of the history without accents or case", () => {
    expect(build(HISTORY).get("cafe")).toEqual({ type: "expense", origin: "history" });
  });

  it("does not let the history add a word the user removed from the fixed one", () => {
    const vocabulary = buildTypeVocabulary({
      fixed: DEFAULT_TYPE_VOCABULARY,
      history: [{ category: "CAF", type: "expense" }],
      overrides: [{ word: "caf", type: null }],
    });

    expect(vocabulary.has("caf")).toBe(false);
  });

  it("changes the type of a word for the user", () => {
    const vocabulary = build(HISTORY, [{ word: "salaire", type: "savings" }]);

    expect(vocabulary.get("salaire")).toEqual({ type: "savings", origin: "user" });
  });

  it("removes a fixed word for the user", () => {
    const vocabulary = build(HISTORY, [{ word: "livret", type: null }]);

    expect(vocabulary.has("livret")).toBe(false);
    expect(findTypeWord("Livret A", vocabulary)).toBeNull();
  });

  it("removes a word of the history for the user", () => {
    expect(build(HISTORY, [{ word: "prime", type: null }]).has("prime")).toBe(false);
  });

  it("adds a word for the user", () => {
    const vocabulary = build([], [{ word: "bonus", type: "income" }]);

    expect(vocabulary.get("bonus")).toEqual({ type: "income", origin: "user" });
  });

  it("lets the user win over the history", () => {
    const vocabulary = build(HISTORY, [{ word: "prime", type: "savings" }]);

    expect(vocabulary.get("prime")).toEqual({ type: "savings", origin: "user" });
  });

  it("reads an override without accents or case", () => {
    const vocabulary = build([], [{ word: "Épargne", type: "expense" }]);

    expect(vocabulary.get("epargne")).toEqual({ type: "expense", origin: "user" });
  });

  it("does not change the fixed vocabulary it is given", () => {
    build(HISTORY, [{ word: "salaire", type: null }]);

    expect(DEFAULT_TYPE_VOCABULARY.get("salaire")).toEqual({ type: "income", origin: "fixed" });
  });
});

describe("normalizeVocabularyWord", () => {
  it("lowercases and removes the accents", () => {
    expect(normalizeVocabularyWord("  Épargne ")).toBe("epargne");
  });

  it.each(["", "   ", "two words", "a-b", "!!!"])("refuses %j", (raw) => {
    expect(normalizeVocabularyWord(raw)).toBeNull();
  });

  it("refuses a word that is too long", () => {
    expect(normalizeVocabularyWord("a".repeat(41))).toBeNull();
    expect(normalizeVocabularyWord("a".repeat(40))).toBe("a".repeat(40));
  });
});
