import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  addVocabularyWordAction,
  changeVocabularyTypeAction,
  removeVocabularyWordAction,
  restoreVocabularyWordAction,
} from "../../../src/app/rules/vocabulary-actions";
import { getTypeVocabulary } from "../../../src/ledger/type-vocabulary";
import { type AppDatabase, migrateDatabase, openDatabase } from "../../../src/storage/database";
import { translateKey } from "../translate-key";

const holder = vi.hoisted(() => ({ db: null as unknown }));

vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("../../../src/app/auth/session", () => ({ requireSession: async () => undefined }));
vi.mock("../../../src/app/translator", () => ({ getTranslator: async () => translateKey }));
vi.mock("../../../src/app/feedback/flash", () => ({
  flashSuccess: async () => undefined,
  flashError: async () => undefined,
  runWithNotice: async (
    change: () => void,
    { describeFailure }: { describeFailure: (error: unknown) => unknown },
  ) => {
    try {
      change();
    } catch (error) {
      describeFailure(error);
    }
  },
}));
vi.mock("../../../src/storage/with-database", () => ({
  withDatabase: <T>(work: (db: AppDatabase) => T): T => work(holder.db as AppDatabase),
}));

function formOf(fields: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [name, value] of Object.entries(fields)) formData.set(name, value);
  return formData;
}

describe("vocabulary actions", () => {
  let dataDir: string;
  let db: AppDatabase;

  beforeEach(() => {
    dataDir = mkdtempSync(path.join(tmpdir(), "demain-test-"));
    db = openDatabase(dataDir);
    migrateDatabase(db);
    holder.db = db;
  });

  afterEach(() => {
    db.$client.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("adds a word and answers with no error", async () => {
    const state = await addVocabularyWordAction(null, formOf({ word: "Bonus", type: "income" }));

    expect(state).toBeNull();
    expect(getTypeVocabulary(db).get("bonus")).toEqual({ type: "income", origin: "user" });
  });

  it("answers an invalid word with the field, the message and what was typed", async () => {
    const state = await addVocabularyWordAction(
      null,
      formOf({ word: "two words", type: "income" }),
    );

    expect(state).toEqual({
      field: "word",
      message: "vocabularyWordInvalid",
      values: { word: "two words", type: "income" },
    });
    expect(getTypeVocabulary(db).has("two")).toBe(false);
  });

  it("answers an invalid type with the field of the type", async () => {
    const state = await addVocabularyWordAction(null, formOf({ word: "bonus", type: "gift" }));

    expect(state).toMatchObject({ field: "type", message: "vocabularyTypeInvalid" });
  });

  it("changes the type of a word, removes it and restores it", async () => {
    await changeVocabularyTypeAction("salaire", formOf({ type: "savings" }));
    expect(getTypeVocabulary(db).get("salaire")).toEqual({ type: "savings", origin: "user" });

    await removeVocabularyWordAction("salaire");
    expect(getTypeVocabulary(db).has("salaire")).toBe(false);

    await restoreVocabularyWordAction("salaire");
    expect(getTypeVocabulary(db).get("salaire")).toEqual({ type: "income", origin: "fixed" });
  });

  it("changes nothing for a type that is not one", async () => {
    await changeVocabularyTypeAction("salaire", formOf({ type: "gift" }));

    expect(getTypeVocabulary(db).get("salaire")).toEqual({ type: "income", origin: "fixed" });
  });
});
