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
import { readCategoryName, type CategoryFormState } from "./category-form-data";

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
  withDatabase((db) => archiveCategory(db, id));
  revalidatePath(CATEGORIES_PATH);
}

/** Categorizes one transaction of the queue: a blank choice does nothing. */
export async function categorizeTransactionAction(
  transactionId: number,
  formData: FormData,
): Promise<void> {
  const raw = formData.get("categoryId");
  if (typeof raw !== "string") return;
  const categoryId = Number(raw);
  if (raw.trim() === "" || !Number.isSafeInteger(categoryId)) return;

  try {
    withDatabase((db) => setTransactionCategory(db, transactionId, categoryId));
  } catch (error) {
    // A stale page can offer a category archived since: refresh instead of failing.
    if (
      !(error instanceof CategoryNotFoundError) &&
      !(error instanceof TransactionValidationError)
    ) {
      throw error;
    }
  }
  revalidatePath(CATEGORIES_PATH);
  revalidatePath(TRANSACTIONS_PATH);
}
