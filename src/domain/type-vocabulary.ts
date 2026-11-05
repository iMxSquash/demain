/**
 * The vocabulary that gives the type of an imported row from the words of its
 * category, on three levels: the fixed one, the words learned from the history,
 * and the user's own changes. Pure functions: no database, no clock. See
 * DOMAIN, section Vocabulary.
 */

import type { MovementType } from "./import-columns";
import {
  tokenize,
  type TypeVocabulary,
  type VocabularyEntry,
} from "./import-guess";

/** A word longer than this is not a word of a category. */
export const MAX_VOCABULARY_WORD_LENGTH = 40;

/** A category confirmed by an earlier import, with the type of its movements. */
export interface HistoryCategory {
  category: string;
  type: MovementType;
}

/** What the user decided for one word: a type, or null to stop recognizing it. */
export interface VocabularyOverride {
  word: string;
  type: MovementType | null;
}

/**
 * The word as the vocabulary keys it (lowercase, without accents), or null
 * when `raw` is not exactly one word of 1 to `MAX_VOCABULARY_WORD_LENGTH` characters.
 */
export function normalizeVocabularyWord(raw: string): string | null {
  const tokens = tokenize(raw);
  const [word] = tokens;
  if (tokens.length !== 1 || word === undefined) return null;
  return word.length <= MAX_VOCABULARY_WORD_LENGTH ? word : null;
}

// Only a category made of one word gives a word: "Frais de sante" would teach
// "de" as a type. A word seen with two types says nothing and is left out.
function wordsOfHistory(history: readonly HistoryCategory[]): Map<string, MovementType> {
  const words = new Map<string, MovementType>();
  const ambiguous = new Set<string>();
  for (const { category, type } of history) {
    const tokens = tokenize(category);
    const [word] = tokens;
    if (tokens.length !== 1 || word === undefined) continue;
    const known = words.get(word);
    if (known !== undefined && known !== type) ambiguous.add(word);
    words.set(word, type);
  }
  for (const word of ambiguous) words.delete(word);
  return words;
}

export interface VocabularyLevels {
  fixed: TypeVocabulary;
  history: readonly HistoryCategory[];
  overrides: readonly VocabularyOverride[];
}

/**
 * The vocabulary an import reads. The priority is the user, then the fixed
 * vocabulary, then the history: the history only adds words the fixed
 * vocabulary does not know, so a disagreement is not applied, and it never
 * brings back a fixed word the user removed.
 */
export function buildTypeVocabulary({
  fixed,
  history,
  overrides,
}: VocabularyLevels): TypeVocabulary {
  const vocabulary = new Map<string, VocabularyEntry>(fixed);
  for (const [word, type] of wordsOfHistory(history)) {
    if (!fixed.has(word)) vocabulary.set(word, { type, origin: "history" });
  }
  for (const { word, type } of overrides) {
    const key = normalizeVocabularyWord(word);
    if (key === null) continue;
    if (type === null) vocabulary.delete(key);
    else vocabulary.set(key, { type, origin: "user" });
  }
  return vocabulary;
}
