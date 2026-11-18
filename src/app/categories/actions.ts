"use server";

import { redirect } from "next/navigation";

import { CategoryValidationError, DEFAULT_CATEGORY_ICON } from "../../domain/category";
import { messageRef, type MessageRef, type Translate } from "../../domain/message";
import { TransactionValidationError } from "../../domain/transaction";
import {
  archiveCategory,
  CategoryNotFoundError,
  createCategory,
  reactivateCategory,
  updateCategory,
} from "../../ledger/categories";
import { setTransactionCategory } from "../../ledger/transactions";
import { withDatabase } from "../../storage/with-database";
import { requireSession } from "../auth/session";
import { refreshData } from "../data-cache";
import { flashError, flashSuccess, runWithNotice } from "../feedback/flash";
import { getTranslator } from "../translator";
import { parseRuleSuggestion } from "../rules/rule-form-data";
import {
  parseCategoryChoice,
  readCategorizeValues,
  readCategoryIcon,
  readCategoryName,
  type CategorizeState,
  type CategoryFormState,
} from "./category-form-data";

const CATEGORIES_PATH = "/categories";

/** A failure that no field explains is told in a toast, the typed name comes back with it. */
async function toFormState(
  error: unknown,
  typed: { name: string; icon: string },
  translate: Translate,
): Promise<CategoryFormState> {
  if (error instanceof CategoryValidationError) {
    return { field: error.field, message: translate(error.ref), ...typed };
  }
  const ref = describeFailure(error);
  await flashError(ref);
  return { message: translate(ref), ...typed };
}

function describeFailure(error: unknown): MessageRef {
  if (error instanceof CategoryNotFoundError) return messageRef("categoryGone");
  // Unexpected failures are logged with their detail, the user sees a generic message.
  console.error("Category action failed", error);
  return messageRef("categoryNotSaved");
}

export async function createCategoryAction(
  _previous: CategoryFormState | null,
  formData: FormData,
): Promise<CategoryFormState | null> {
  await requireSession();
  const name = readCategoryName(formData);
  const icon = readCategoryIcon(formData);
  try {
    withDatabase((db) => createCategory(db, { name, ...(icon === undefined ? {} : { icon }) }));
  } catch (error) {
    return await toFormState(
      error,
      { name, icon: icon ?? DEFAULT_CATEGORY_ICON },
      await getTranslator(),
    );
  }

  refreshData();
  await flashSuccess("categoryCreated");
  return null;
}

export async function updateCategoryAction(
  id: number,
  _previous: CategoryFormState | null,
  formData: FormData,
): Promise<CategoryFormState | null> {
  await requireSession();
  const name = readCategoryName(formData);
  const icon = readCategoryIcon(formData);
  try {
    withDatabase((db) => updateCategory(db, id, { name, ...(icon === undefined ? {} : { icon }) }));
  } catch (error) {
    return await toFormState(
      error,
      { name, icon: icon ?? DEFAULT_CATEGORY_ICON },
      await getTranslator(),
    );
  }

  refreshData();
  await flashSuccess("categoryRenamed");
  // redirect throws, so it stays outside the try block.
  redirect(CATEGORIES_PATH);
}

export async function archiveCategoryAction(id: number): Promise<void> {
  await requireSession();
  await runWithNotice(() => withDatabase((db) => archiveCategory(db, id)), {
    success: "categoryArchived",
    describeFailure: describeArchiveFailure,
  });
  refreshData();
}

function describeArchiveFailure(error: unknown): MessageRef {
  // Already gone since the page was loaded: the refreshed page shows it.
  if (error instanceof CategoryNotFoundError) return messageRef("categoryGone");
  console.error("Category archive failed", error);
  return messageRef("categoryNotArchived");
}

export async function reactivateCategoryAction(id: number): Promise<void> {
  await requireSession();
  await runWithNotice(
    () => {
      withDatabase((db) => reactivateCategory(db, id));
    },
    { success: "categoryReactivated", describeFailure: describeReactivateFailure },
  );
  refreshData();
}

function describeReactivateFailure(error: unknown): MessageRef {
  if (error instanceof CategoryNotFoundError) return messageRef("categoryGone");
  console.error("Category reactivation failed", error);
  return messageRef("categoryNotReactivated");
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
  // Parsed first, so that a refused suggestion is reported before the database is touched.
  const suggestion = parseRuleSuggestion(formData, translate);
  if (!suggestion.ok) {
    return {
      field: "rule",
      message: suggestion.message,
      values: readCategorizeValues(formData),
    };
  }

  try {
    withDatabase((db) =>
      setTransactionCategory(db, transactionId, choice.categoryId, {
        rule: suggestion.rule,
      }),
    );
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

  refreshData();
  await flashSuccess("categoryAssigned");
  return null;
}
