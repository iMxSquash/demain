/**
 * Category rules. Pure functions: no database, no clock. See DOMAIN, entity
 * Category and categorization rule.
 */

import {
  TransactionValidationError,
  type EnteredTransactionKind,
} from "./transaction";

export class CategoryValidationError extends Error {
  readonly field = "name";

  constructor(message: string) {
    super(message);
    this.name = "CategoryValidationError";
  }
}

export function validateCategoryName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    throw new CategoryValidationError("The category name is required");
  }
  return trimmed;
}

/**
 * Names are unique among all categories, archived ones included, so that two
 * homonyms never coexist in the history or in a rule. `existing` holds every
 * stored category; `ignoreId` is the category being renamed.
 */
export function assertCategoryNameAvailable(
  name: string,
  existing: readonly { id: number; name: string }[],
  { ignoreId }: { ignoreId?: number } = {},
): void {
  const wanted = name.toLowerCase();
  const clash = existing.find(
    (category) =>
      category.id !== ignoreId && category.name.toLowerCase() === wanted,
  );
  if (clash !== undefined) {
    throw new CategoryValidationError(
      `A category named "${clash.name}" already exists`,
    );
  }
}

/**
 * A transfer is a move between the owner's own accounts, so it has no category
 * (DOMAIN, entity Transaction). An archived category is hidden from pickers:
 * transactions that already carry it keep it, but it is never newly chosen.
 * The error belongs to the transaction, whose category is being set.
 */
export function assertCategoryAssignable(
  kind: EnteredTransactionKind | "transfer",
  category: { id: number; archived: boolean } | null,
): void {
  if (category === null) return;
  if (kind === "transfer") {
    throw new TransactionValidationError(
      "categoryId",
      "A transfer has no category",
    );
  }
  if (category.archived) {
    throw new TransactionValidationError(
      "categoryId",
      "This category is archived and cannot be assigned",
    );
  }
}
