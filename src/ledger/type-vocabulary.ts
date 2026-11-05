import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { z } from "zod";

import { MOVEMENT_TYPES } from "../domain/import-columns";
import {
  DEFAULT_TYPE_VOCABULARY,
  type TypeVocabulary,
  type VocabularyEntry,
} from "../domain/import-guess";
import { messageRef, type MessageRef } from "../domain/message";
import {
  buildTypeVocabulary,
  normalizeVocabularyWord,
  type HistoryCategory,
  type VocabularyOverride,
} from "../domain/type-vocabulary";
import type { AppDatabase } from "../storage/database";
import { categories, settings, transactions } from "../storage/schema";

// The choices of the user are one JSON object in the settings, word to type,
// null for a word that is no longer recognized. A table would add a migration
// for a few dozen words, and the settings are already part of the exports.
const OVERRIDES_KEY = "type_vocabulary_overrides";

const wordSchema = z
  .string()
  .transform((raw) => normalizeVocabularyWord(raw) ?? "")
  .pipe(z.string().min(1));
const typeSchema = z.enum(MOVEMENT_TYPES);

const wordInputSchema = z.strictObject({ word: wordSchema, type: typeSchema });
const storedOverridesSchema = z.record(wordSchema, typeSchema.nullable());

export type VocabularyField = "word" | "type";

export class VocabularyValidationError extends Error {
  constructor(
    readonly field: VocabularyField,
    /** English text for logs and tests: users read the translation of `ref`. */
    message: string,
    readonly ref: MessageRef,
  ) {
    super(message);
    this.name = "VocabularyValidationError";
  }
}

function invalid(field: VocabularyField): VocabularyValidationError {
  return field === "word"
    ? new VocabularyValidationError(
        "word",
        "The word must be one word of 40 characters at most",
        messageRef("vocabularyWordInvalid"),
      )
    : new VocabularyValidationError(
        "type",
        "The type must be expense, income or savings",
        messageRef("vocabularyTypeInvalid"),
      );
}

/** Whatever comes from the browser: nothing is trusted until it has been through here. */
function parseWordInput(input: unknown): { word: string; type: (typeof MOVEMENT_TYPES)[number] } {
  const parsed = wordInputSchema.safeParse(input);
  if (parsed.success) return parsed.data;
  const field = parsed.error.issues.some((issue) => issue.path[0] === "word") ? "word" : "type";
  throw invalid(field);
}

function parseWord(input: unknown): string {
  const parsed = wordSchema.safeParse(input);
  if (!parsed.success) throw invalid("word");
  return parsed.data;
}

type Reader = Pick<AppDatabase, "select" | "selectDistinct">;

type OverrideMap = Map<string, VocabularyOverride["type"]>;

function readOverrides(db: Pick<AppDatabase, "select">): OverrideMap {
  const stored = db.select().from(settings).where(eq(settings.key, OVERRIDES_KEY)).get();
  if (stored === undefined) return new Map();
  // A stored value that does not parse is a corrupted database: stop rather than guess.
  return new Map(Object.entries(storedOverridesSchema.parse(JSON.parse(stored.value))));
}

function writeOverrides(db: Pick<AppDatabase, "insert" | "delete">, overrides: OverrideMap): void {
  if (overrides.size === 0) {
    db.delete(settings).where(eq(settings.key, OVERRIDES_KEY)).run();
    return;
  }
  const value = JSON.stringify(Object.fromEntries(overrides));
  db.insert(settings)
    .values({ key: OVERRIDES_KEY, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } })
    .run();
}

/**
 * The categories given to the rows of earlier imports, with the type of those
 * rows. Only an imported row counts: it was reviewed by the user. A transfer
 * has no category and an interest is neither an expense nor an income word.
 */
function readHistory(db: Reader): HistoryCategory[] {
  return db
    .selectDistinct({ category: categories.name, kind: transactions.kind })
    .from(transactions)
    .innerJoin(categories, eq(categories.id, transactions.categoryId))
    .where(
      and(
        isNotNull(transactions.importBatchId),
        inArray(transactions.kind, ["expense", "income"]),
      ),
    )
    .all()
    .flatMap(({ category, kind }) =>
      kind === "expense" || kind === "income" ? [{ category, type: kind }] : [],
    );
}

function toList(overrides: OverrideMap): VocabularyOverride[] {
  return [...overrides].map(([word, type]) => ({ word, type }));
}

/** The vocabulary an import reads: the fixed words, the history and the choices of the user. */
export function getTypeVocabulary(db: Reader): TypeVocabulary {
  return buildTypeVocabulary({
    fixed: DEFAULT_TYPE_VOCABULARY,
    history: readHistory(db),
    overrides: toList(readOverrides(db)),
  });
}

export interface VocabularyWord extends VocabularyEntry {
  word: string;
}

export interface VocabularyOverview {
  /** Every recognized word, in alphabetical order. */
  words: VocabularyWord[];
  /** The fixed and learned words the user stopped recognizing, in alphabetical order. */
  removed: string[];
}

export function getVocabularyOverview(db: Reader): VocabularyOverview {
  const overrides = readOverrides(db);
  const vocabulary = buildTypeVocabulary({
    fixed: DEFAULT_TYPE_VOCABULARY,
    history: readHistory(db),
    overrides: toList(overrides),
  });
  return {
    words: [...vocabulary]
      .map(([word, entry]) => ({ word, ...entry }))
      .sort((a, b) => a.word.localeCompare(b.word)),
    removed: [...overrides]
      .filter(([, type]) => type === null)
      .map(([word]) => word)
      .sort(),
  };
}

/** Adds a word or changes its type; the user's choice wins over the fixed words and the history. */
export function setVocabularyWord(db: AppDatabase, input: unknown): void {
  const { word, type } = parseWordInput(input);
  db.transaction((tx) => {
    const overrides = readOverrides(tx);
    overrides.set(word, type);
    writeOverrides(tx, overrides);
  });
}

/**
 * Stops recognizing a word. A word the user added alone is forgotten; a fixed
 * or learned one is remembered as removed, so that it stays removed.
 */
export function removeVocabularyWord(db: AppDatabase, rawWord: unknown): void {
  const word = parseWord(rawWord);
  db.transaction((tx) => {
    const overrides = readOverrides(tx);
    const withoutUser = new Map(overrides);
    withoutUser.delete(word);
    const isBaseWord = buildTypeVocabulary({
      fixed: DEFAULT_TYPE_VOCABULARY,
      history: readHistory(tx),
      overrides: toList(withoutUser),
    }).has(word);
    if (isBaseWord) withoutUser.set(word, null);
    writeOverrides(tx, withoutUser);
  });
}

/** Forgets the choice of the user on a word: it goes back to the fixed or learned one, if any. */
export function restoreVocabularyWord(db: AppDatabase, rawWord: unknown): void {
  const word = parseWord(rawWord);
  db.transaction((tx) => {
    const overrides = readOverrides(tx);
    overrides.delete(word);
    writeOverrides(tx, overrides);
  });
}
