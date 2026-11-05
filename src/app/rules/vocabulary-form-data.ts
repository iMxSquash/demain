import { readText } from "../auth/auth-form-data";
import type { VocabularyField } from "../../ledger/type-vocabulary";

export interface VocabularyFormValues {
  word: string;
  type: string;
}

export interface VocabularyFormState {
  field?: VocabularyField;
  message: string;
  /** What the user typed: React resets the form after an action, so it is sent back. */
  values: VocabularyFormValues;
}

/** The raw fields: the ledger validates them, nothing from the browser is trusted. */
export function readVocabularyFormValues(formData: FormData): VocabularyFormValues {
  return { word: readText(formData, "word"), type: readText(formData, "type") };
}
