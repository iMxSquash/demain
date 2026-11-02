/**
 * Guesses the type (expense, income, savings) of an imported row from layers
 * of evidence, the most reliable first. Pure functions: no database, no clock.
 * See DOMAIN, section Guessing the type of an imported row.
 */

import { readMovementType, type MovementType } from "./import-columns";
import { normalizeLabel } from "./import-row";

export type Direction = "in" | "out";

export type Confidence = "high" | "medium" | "low";

/** Keys are accent-free lowercase tokens. A Map: file text must not reach Object.prototype. */
export type TypeVocabulary = ReadonlyMap<string, MovementType>;

/** Key: `normalizeLabel(label)` of earlier imports of the account. */
export type LabelHistory = ReadonlyMap<string, MovementType>;

const INCOME_WORDS = [
  "salaire",
  "salaires",
  "salary",
  "salaries",
  "paie",
  "paye",
  "payroll",
  "revenu",
  "revenus",
  "income",
  "allocation",
  "allocations",
  "caf",
  "dividende",
  "dividendes",
  "dividend",
  "dividends",
];

const SAVINGS_WORDS = [
  "epargne",
  "epargnes",
  "savings",
  "saving",
  "livret",
  "livrets",
  "ldds",
  "lep",
  "pel",
  "cel",
];

// No expense word: an outgoing amount is an expense unless something says otherwise.
export const DEFAULT_TYPE_VOCABULARY: TypeVocabulary = new Map<string, MovementType>([
  ...INCOME_WORDS.map((word): [string, MovementType] => [word, "income"]),
  ...SAVINGS_WORDS.map((word): [string, MovementType] => [word, "savings"]),
]);

export type TypeEvidence =
  | { kind: "typeCell"; value: string }
  | { kind: "debitCredit"; direction: Direction }
  | { kind: "sign"; direction: Direction }
  | { kind: "categoryWord"; category: string; word: string; type: MovementType }
  | { kind: "history"; type: MovementType }
  | { kind: "none" };

export interface TypeSignals {
  /** Trimmed type cell; null when the file has no type column. */
  typeCell: string | null;
  /** Null when the amounts of the file carry no direction. */
  direction: Direction | null;
  directionSource: "sign" | "debitCredit";
  /** Category cell; null when none. */
  category: string | null;
  label: string;
}

export interface GuessContext {
  vocabulary: TypeVocabulary;
  history: LabelHistory;
}

export interface TypeGuess {
  type: MovementType;
  /** Only `low` flags the row for the user to check. */
  confidence: Confidence;
  /** What gave the type, for "guessed: category is salaire". */
  evidence: TypeEvidence;
  /** What disagreed and was overruled. */
  conflict: TypeEvidence | null;
  /** A type cell that names no known type, ignored. */
  ignoredTypeCell: string | null;
}

// Lowercase, without accents, cut on anything that is not a letter or a digit.
function tokenize(text: string): string[] {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token !== "");
}

/** The first word of `text` the vocabulary knows. Whole words only, never parts of a word. */
export function findTypeWord(
  text: string,
  vocabulary: TypeVocabulary,
): { word: string; type: MovementType } | null {
  for (const word of tokenize(text)) {
    const type = vocabulary.get(word);
    if (type !== undefined) return { word, type };
  }
  return null;
}

/** Split columns, or at least one negative amount in the file. */
export function amountsCarrySign(
  amountKind: "single" | "split",
  amounts: readonly number[],
): boolean {
  return amountKind === "split" || amounts.some((amount) => amount < 0);
}

/**
 * An outgoing amount is an expense or savings, an incoming one is an income or
 * savings: money coming back from a savings account is a withdrawal.
 */
function isCompatible(type: MovementType, direction: Direction | null): boolean {
  if (direction === null || type === "savings") return true;
  return direction === "out" ? type === "expense" : type === "income";
}

interface Hint {
  type: MovementType;
  evidence: TypeEvidence;
}

/** The first clue beyond the type cell and the sign: the category word, then the history. */
function findHint(signals: TypeSignals, context: GuessContext): Hint | null {
  if (signals.category !== null) {
    const found = findTypeWord(signals.category, context.vocabulary);
    if (found !== null) {
      return {
        type: found.type,
        evidence: {
          kind: "categoryWord",
          category: signals.category,
          word: found.word,
          type: found.type,
        },
      };
    }
  }
  const type = context.history.get(normalizeLabel(signals.label));
  return type === undefined ? null : { type, evidence: { kind: "history", type } };
}

type DirectionEvidence = Extract<TypeEvidence, { kind: "sign" | "debitCredit" }>;

type Guess = Pick<TypeGuess, "type" | "confidence" | "evidence" | "conflict">;

// The sign of the amount settles the type, unless a clue agrees with it (more
// reliable than the sign alone) or contradicts it (flagged, the sign winning).
function guessFromClues(
  hint: Hint | null,
  directionEvidence: DirectionEvidence | null,
): Guess {
  if (directionEvidence === null) {
    return hint === null
      ? { type: "expense", confidence: "low", evidence: { kind: "none" }, conflict: null }
      : { type: hint.type, confidence: "low", evidence: hint.evidence, conflict: null };
  }
  const { direction } = directionEvidence;
  if (hint !== null && isCompatible(hint.type, direction)) {
    return { type: hint.type, confidence: "medium", evidence: hint.evidence, conflict: null };
  }
  const type = direction === "out" ? "expense" : "income";
  return {
    type,
    confidence: hint === null ? "medium" : "low",
    evidence: directionEvidence,
    conflict: hint?.evidence ?? null,
  };
}

export function guessMovementType(
  signals: TypeSignals,
  context: GuessContext,
): TypeGuess {
  const { typeCell, direction } = signals;
  const directionEvidence: DirectionEvidence | null =
    direction === null ? null : { kind: signals.directionSource, direction };

  const cellType = typeCell === null ? null : readMovementType(typeCell);
  if (typeCell !== null && cellType !== null) {
    const isAgreeing = isCompatible(cellType, direction);
    return {
      type: cellType,
      confidence: isAgreeing ? "high" : "low",
      evidence: { kind: "typeCell", value: typeCell },
      conflict: isAgreeing ? null : directionEvidence,
      ignoredTypeCell: null,
    };
  }

  const guess = guessFromClues(findHint(signals, context), directionEvidence);
  // A type column that says nothing usable is itself a reason to check the row.
  const confidence = typeCell === null ? guess.confidence : "low";
  return {
    ...guess,
    confidence,
    ignoredTypeCell: typeCell === null || typeCell === "" ? null : typeCell,
  };
}
