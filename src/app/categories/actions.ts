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
import { setTransactionCategory } from "../../ledger/transactions";
import { withDatabase } from "../../storage/with-database";
import { getTranslator } from "../translator";
import {
  parseCategoryChoice,
  readCategoryName,
  type CategorizeState,
  type CategoryFormState,
} from "./category-form-data";

const CATEGORIES_PATH = "/categories";
const TRANSACTIONS_PATH = "/transactions";

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
  const translate = await getTranslator();
  const choice = parseCategoryChoice(formData, translate);
  if (!choice.ok) return { message: choice.message };

  try {
    withDatabase((db) =>
      setTransactionCategory(db, transactionId, choice.categoryId),
    );
  } catch (error) {
    if (error instanceof CategoryNotFoundError) {
      return { message: translate(messageRef("categoryGone")) };
    }
    if (error instanceof TransactionValidationError) {
      return { message: translate(error.ref) };
    }
    // Unexpected failures are logged with their detail, the user sees a generic message.
    console.error("Categorize action failed", error);
    return { message: translate(messageRef("nothingSaved")) };
  }

  revalidatePath(CATEGORIES_PATH);
  revalidatePath(TRANSACTIONS_PATH);
  return null;
}
