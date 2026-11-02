import { describe, expect, it } from "vitest";

import {
  DEFAULT_TYPE_VOCABULARY,
  amountsCarrySign,
  findTypeWord,
  guessMovementType,
  type GuessContext,
  type TypeSignals,
} from "../../src/domain/import-guess";

describe("findTypeWord", () => {
  it("finds the vocabulary word in a longer text", () => {
    expect(findTypeWord("Salaire ACME", DEFAULT_TYPE_VOCABULARY)).toEqual({
      word: "salaire",
      type: "income",
    });
  });

  it("ignores case, accents and surrounding spaces", () => {
    expect(findTypeWord(" Épargne ", DEFAULT_TYPE_VOCABULARY)).toEqual({
      word: "epargne",
      type: "savings",
    });
  });

  it("finds nothing in a text without a known word", () => {
    expect(findTypeWord("Courses", DEFAULT_TYPE_VOCABULARY)).toBeNull();
  });

  it("compares whole words, never parts of a word", () => {
    expect(findTypeWord("parentes", DEFAULT_TYPE_VOCABULARY)).toBeNull();
  });

  it("does not let file text reach Object.prototype", () => {
    expect(findTypeWord("constructor", DEFAULT_TYPE_VOCABULARY)).toBeNull();
  });
});

describe("amountsCarrySign", () => {
  it("is true for split debit and credit columns", () => {
    expect(amountsCarrySign("split", [100, 250])).toBe(true);
  });

  it("is false when every amount of a single column is positive", () => {
    expect(amountsCarrySign("single", [100, 250])).toBe(false);
  });

  it("is true as soon as one amount of a single column is negative", () => {
    expect(amountsCarrySign("single", [100, -250, 40])).toBe(true);
  });
});

const NO_HISTORY: GuessContext = {
  vocabulary: DEFAULT_TYPE_VOCABULARY,
  history: new Map(),
};

// A row with nothing to go by: each test sets only the signal it is about.
const signalsOf = (overrides: Partial<TypeSignals>): TypeSignals => ({
  typeCell: null,
  direction: null,
  directionSource: "sign",
  category: null,
  label: "Some label",
  ...overrides,
});

describe("guessMovementType with an explicit type cell", () => {
  it("trusts the cell with a high confidence when the file has no direction", () => {
    const guess = guessMovementType(signalsOf({ typeCell: "Expense" }), NO_HISTORY);

    expect(guess).toMatchObject({
      type: "expense",
      confidence: "high",
      evidence: { kind: "typeCell", value: "Expense" },
      conflict: null,
      ignoredTypeCell: null,
      toConfirm: false,
    });
  });

  it("stays high when the sign agrees with the cell", () => {
    const guess = guessMovementType(
      signalsOf({ typeCell: "Income", direction: "in" }),
      NO_HISTORY,
    );

    expect(guess).toMatchObject({ type: "income", confidence: "high", toConfirm: false });
  });

  it("lets the cell win over the sign, flags the row and names the sign as the conflict", () => {
    const guess = guessMovementType(
      signalsOf({ typeCell: "Income", direction: "out" }),
      NO_HISTORY,
    );

    expect(guess).toMatchObject({
      type: "income",
      confidence: "low",
      evidence: { kind: "typeCell", value: "Income" },
      conflict: { kind: "sign", direction: "out" },
      toConfirm: true,
    });
  });

  it("names the debit and credit columns as the conflict when they gave the direction", () => {
    const guess = guessMovementType(
      signalsOf({ typeCell: "Income", direction: "out", directionSource: "debitCredit" }),
      NO_HISTORY,
    );

    expect(guess.conflict).toEqual({ kind: "debitCredit", direction: "out" });
  });
});

describe("guessMovementType from the direction of the amount", () => {
  it("guesses an expense from an outgoing sign, with a medium confidence", () => {
    const guess = guessMovementType(signalsOf({ direction: "out" }), NO_HISTORY);

    expect(guess).toMatchObject({
      type: "expense",
      confidence: "medium",
      evidence: { kind: "sign", direction: "out" },
      conflict: null,
      toConfirm: false,
    });
  });

  it("guesses an income from an incoming sign", () => {
    const guess = guessMovementType(signalsOf({ direction: "in" }), NO_HISTORY);

    expect(guess).toMatchObject({
      type: "income",
      confidence: "medium",
      evidence: { kind: "sign", direction: "in" },
    });
  });

  it("names the debit and credit columns as the evidence when they gave the direction", () => {
    const guess = guessMovementType(
      signalsOf({ direction: "out", directionSource: "debitCredit" }),
      NO_HISTORY,
    );

    expect(guess.evidence).toEqual({ kind: "debitCredit", direction: "out" });
  });
});

describe("guessMovementType from the category word", () => {
  it("takes savings from an outgoing amount in an epargne category, with a medium confidence", () => {
    const guess = guessMovementType(
      signalsOf({ direction: "out", category: "Épargne" }),
      NO_HISTORY,
    );

    expect(guess).toMatchObject({
      type: "savings",
      confidence: "medium",
      evidence: { kind: "categoryWord", category: "Épargne", word: "epargne", type: "savings" },
      conflict: null,
      toConfirm: false,
    });
  });

  it("takes the word of the category as the only clue when the file has no direction, and asks to confirm", () => {
    const guess = guessMovementType(signalsOf({ category: "Salaire" }), NO_HISTORY);

    expect(guess).toMatchObject({
      type: "income",
      confidence: "low",
      evidence: { kind: "categoryWord", category: "Salaire", word: "salaire", type: "income" },
      conflict: null,
      toConfirm: true,
    });
  });

  it("lets the sign win over a category word that contradicts it, and names the word as the conflict", () => {
    const guess = guessMovementType(
      signalsOf({ direction: "out", category: "Salaire" }),
      NO_HISTORY,
    );

    expect(guess).toMatchObject({
      type: "expense",
      confidence: "low",
      evidence: { kind: "sign", direction: "out" },
      conflict: { kind: "categoryWord", category: "Salaire", word: "salaire", type: "income" },
      toConfirm: true,
    });
  });
});

describe("guessMovementType from the history", () => {
  const savedLabel: GuessContext = {
    vocabulary: DEFAULT_TYPE_VOCABULARY,
    history: new Map([["virement livret a", "savings"]]),
  };

  it("takes the type of an earlier import of the same label, whatever its spacing and case", () => {
    const guess = guessMovementType(
      signalsOf({ direction: "out", label: "  Virement  LIVRET A " }),
      savedLabel,
    );

    expect(guess).toMatchObject({
      type: "savings",
      confidence: "medium",
      evidence: { kind: "history", type: "savings" },
    });
  });

  it("puts the category word before the history", () => {
    const guess = guessMovementType(
      signalsOf({ direction: "out", category: "Livret", label: "virement livret a" }),
      { vocabulary: DEFAULT_TYPE_VOCABULARY, history: new Map([["virement livret a", "expense"]]) },
    );

    expect(guess.type).toBe("savings");
    expect(guess.evidence).toMatchObject({ kind: "categoryWord", word: "livret" });
  });
});

describe("guessMovementType with a type column that does not help", () => {
  it("falls back on the sign when the cell names no known type, keeps the cell aside and asks to confirm", () => {
    const guess = guessMovementType(
      signalsOf({ typeCell: "Remboursement", direction: "in" }),
      NO_HISTORY,
    );

    expect(guess).toMatchObject({
      type: "income",
      confidence: "low",
      evidence: { kind: "sign", direction: "in" },
      ignoredTypeCell: "Remboursement",
      toConfirm: true,
    });
  });

  it("asks to confirm when the cell is empty, without keeping anything aside", () => {
    const guess = guessMovementType(
      signalsOf({ typeCell: "", direction: "out" }),
      NO_HISTORY,
    );

    expect(guess).toMatchObject({
      type: "expense",
      confidence: "low",
      ignoredTypeCell: null,
      toConfirm: true,
    });
  });
});

describe("guessMovementType without any clue", () => {
  it("falls back on an expense and asks to confirm", () => {
    const guess = guessMovementType(signalsOf({}), NO_HISTORY);

    expect(guess).toEqual({
      type: "expense",
      confidence: "low",
      evidence: { kind: "none" },
      conflict: null,
      ignoredTypeCell: null,
      toConfirm: true,
    });
  });

  it("reads the vocabulary of the context instead of the default one", () => {
    const custom: GuessContext = {
      vocabulary: new Map([["prime", "income"]]),
      history: new Map(),
    };

    const guess = guessMovementType(signalsOf({ category: "Prime" }), custom);
    const defaultGuess = guessMovementType(
      signalsOf({ category: "Salaire" }),
      custom,
    );

    expect(guess.type).toBe("income");
    expect(guess.evidence).toMatchObject({ kind: "categoryWord", word: "prime" });
    expect(defaultGuess.evidence).toEqual({ kind: "none" });
  });
});
