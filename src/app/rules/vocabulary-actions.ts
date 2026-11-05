"use server";

import { revalidatePath } from "next/cache";

import { messageRef, type FeedbackKey, type MessageRef } from "../../domain/message";
import {
  removeVocabularyWord,
  restoreVocabularyWord,
  setVocabularyWord,
  VocabularyValidationError,
} from "../../ledger/type-vocabulary";
import type { AppDatabase } from "../../storage/database";
import { withDatabase } from "../../storage/with-database";
import { requireSession } from "../auth/session";
import { flashError, flashSuccess, runWithNotice } from "../feedback/flash";
import { getTranslator } from "../translator";
import { readVocabularyFormValues, type VocabularyFormState } from "./vocabulary-form-data";

const RULES_PATH = "/rules";

export async function addVocabularyWordAction(
  _previous: VocabularyFormState | null,
  formData: FormData,
): Promise<VocabularyFormState | null> {
  await requireSession();
  const translate = await getTranslator();
  const values = readVocabularyFormValues(formData);

  try {
    withDatabase((db) => setVocabularyWord(db, values));
  } catch (error) {
    if (error instanceof VocabularyValidationError) {
      return { field: error.field, message: translate(error.ref), values };
    }
    // Unexpected failures are logged with their detail, the user sees a generic message.
    console.error("Vocabulary action failed", error);
    const ref = messageRef("nothingSaved");
    await flashError(ref);
    return { message: translate(ref), values };
  }

  revalidatePath(RULES_PATH);
  await flashSuccess("vocabularyWordSaved");
  return null;
}

function describeChangeFailure(error: unknown): MessageRef {
  if (error instanceof VocabularyValidationError) return error.ref;
  console.error("Vocabulary change failed", error);
  return messageRef("vocabularyNotChanged");
}

async function changeVocabulary(
  change: (db: AppDatabase) => void,
  success: FeedbackKey,
): Promise<void> {
  await requireSession();
  await runWithNotice(() => withDatabase(change), {
    success,
    describeFailure: describeChangeFailure,
  });
  revalidatePath(RULES_PATH);
}

export async function changeVocabularyTypeAction(word: string, formData: FormData): Promise<void> {
  const { type } = readVocabularyFormValues(formData);
  await changeVocabulary((db) => setVocabularyWord(db, { word, type }), "vocabularyWordSaved");
}

export async function removeVocabularyWordAction(word: string): Promise<void> {
  await changeVocabulary((db) => removeVocabularyWord(db, word), "vocabularyWordRemoved");
}

export async function restoreVocabularyWordAction(word: string): Promise<void> {
  await changeVocabulary((db) => restoreVocabularyWord(db, word), "vocabularyWordRestored");
}
