"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { CategoryValidationError } from "../../domain/category";
import { messageRef, type Translate } from "../../domain/message";
import { TransactionValidationError } from "../../domain/transaction";
import {
  archiveCategory,
  CategoryNotFoundError,
  createCategory,
  renameCategory,
} from "../../ledger/categories";
import { createRule } from "../../ledger/categorization-rules";
import { setTransactionCategory } from "../../ledger/transactions";
import { withDatabase } from "../../storage/with-database";
import { requireSession } from "../auth/session";
import { getTranslator } from "../translator";
import { parseRuleSuggestion } from "../rules/rule-form-data";
import {
  parseCategoryChoice,
  readCategorizeValues,
  readCategoryName,
  type CategorizeState,
  type CategoryFormState,
} from "./category-form-data";

const CATEGORIES_PATH = "/categories";
const TRANSACTIONS_PATH = "/transactions";
const RULES_PATH = "/rules";

function toFormState(
  error: unknown,
  name: string,
  translate: Translate,
): CategoryFormState {
  if (error instanceof CategoryValidationError) {
    return { field: error.field, message: translate(error.ref), name };
  }
  if (error instanceof CategoryNotFoundError) {
    return { message: translate(messageRef("categoryGone")), name };
  }
  // Unexpected failures are logged with their detail, the user sees a generic message.
  console.error("Category action failed", error);
  return { message: translate(messageRef("categoryNotSaved")), name };
}

export async function createCategoryAction(
  _previous: CategoryFormState | null,
  formData: FormData,
): Promise<CategoryFormState | null> {
  await requireSession();
  const name = readCategoryName(formData);
  try {
    withDatabase((db) => createCategory(db, { name }));
  } catch (error) {
    return toFormState(error, name, await getTranslator());
  }

  revalidatePath(CATEGORIES_PATH);
  return null;
}

export async function renameCategoryAction(
  id: number,
  _previous: CategoryFormState | null,
  formData: FormData,
): Promise<CategoryFormState | null> {
  await requireSession();
  const name = readCategoryName(formData);
  try {
    withDatabase((db) => renameCategory(db, id, { name }));
  } catch (error) {
    return toFormState(error, name, await getTranslator());
  }

  revalidatePath(CATEGORIES_PATH);
  revalidatePath(TRANSACTIONS_PATH);
  // redirect throws, so it stays outside the try block.
  redirect(CATEGORIES_PATH);
}

export async function archiveCategoryAction(id: number): Promise<void> {
  await requireSession();
  try {
    withDatabase((db) => archiveCategory(db, id));
  } catch (error) {
    // Already gone since the page was loaded: the refreshed page shows it.
    if (!(error instanceof CategoryNotFoundError)) throw error;
  }
  revalidatePath(CATEGORIES_PATH);
}

/** Categorizes one transaction of the queue and says why when it is refused. */
export async function categorizeTransactionAction(
  transactionId: number,
  _previous: CategorizeState | null,
  formData: FormData,
): Promise<CategorizeState | null> {
  await requireSession();
  const translate = await getTranslator();
  const choice = parseCategoryChoice(formData, translate);
  if (!choice.ok) return { field: "category", message: choice.message };
  // Checked before anything is written: a refused rule must not leave the row half done.
  const suggestion = parseRuleSuggestion(formData, translate);
  if (!suggestion.ok) {
    return {
      field: "rule",
      message: suggestion.message,
      values: readCategorizeValues(formData),
    };
  }

  try {
    withDatabase((db) => {
      setTransactionCategory(db, transactionId, choice.categoryId);
      if (suggestion.rule !== null) {
        createRule(db, { ...suggestion.rule, categoryId: choice.categoryId });
      }
    });
  } catch (error) {
    if (error instanceof CategoryNotFoundError) {
      return { field: "category", message: translate(messageRef("categoryGone")) };
    }
    if (error instanceof TransactionValidationError) {
      return { field: "category", message: translate(error.ref) };
    }
    // Unexpected failures are logged with their detail, the user sees a generic message.
    console.error("Categorize action failed", error);
    return { field: "category", message: translate(messageRef("nothingSaved")) };
  }

  revalidatePath(CATEGORIES_PATH);
  revalidatePath(TRANSACTIONS_PATH);
  revalidatePath(RULES_PATH);
  return null;
}
