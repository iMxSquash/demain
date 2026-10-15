"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { CategoryValidationError } from "../../domain/category";
import { TransactionValidationError } from "../../domain/transaction";
import {
  archiveCategory,
  CategoryNotFoundError,
  createCategory,
  renameCategory,
} from "../../ledger/categories";
import { setTransactionCategory } from "../../ledger/transactions";
import { withDatabase } from "../../storage/with-database";
import {
  parseCategoryChoice,
  readCategoryName,
  type CategorizeState,
  type CategoryFormState,
} from "./category-form-data";

const CATEGORIES_PATH = "/categories";
const TRANSACTIONS_PATH = "/transactions";

function toFormState(error: unknown, name: string): CategoryFormState {
  if (error instanceof CategoryValidationError) {
    return { field: error.field, message: error.message, name };
  }
  if (error instanceof CategoryNotFoundError) {
    return { message: "This category no longer exists.", name };
  }
  // Unexpected failures are logged with their detail, the user sees a generic message.
  console.error("Category action failed", error);
  return { message: "Something went wrong, the category was not saved.", name };
}

export async function createCategoryAction(
  _previous: CategoryFormState | null,
  formData: FormData,
): Promise<CategoryFormState | null> {
  const name = readCategoryName(formData);
  try {
    withDatabase((db) => createCategory(db, { name }));
  } catch (error) {
    return toFormState(error, name);
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
    return toFormState(error, name);
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
  const choice = parseCategoryChoice(formData);
  if (!choice.ok) return { message: choice.message };

  try {
    withDatabase((db) =>
      setTransactionCategory(db, transactionId, choice.categoryId),
    );
  } catch (error) {
    if (error instanceof CategoryNotFoundError) {
      return { message: "This category no longer exists." };
    }
    if (error instanceof TransactionValidationError) {
      return { message: error.message };
    }
    // Unexpected failures are logged with their detail, the user sees a generic message.
    console.error("Categorize action failed", error);
    return { message: "Something went wrong, nothing was saved." };
  }

  revalidatePath(CATEGORIES_PATH);
  revalidatePath(TRANSACTIONS_PATH);
  return null;
}
