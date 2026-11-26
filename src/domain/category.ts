/**
 * Category rules. Pure functions: no database, no clock. See DOMAIN, entity
 * Category and categorization rule.
 */

import { messageRef, type MessageRef } from "./message";
import { TransactionValidationError, type EnteredTransactionKind } from "./transaction";

/**
 * The icons a category can have, by key. The set is closed: a category carries one of these keys and
 * the app draws it (the keys are drawn in `src/components/category-icons.ts`). A user-written text
 * or an uploaded image is never an icon.
 */
export const CATEGORY_ICONS = [
  "tag",
  "basket",
  "fork-knife",
  "house",
  "bus",
  "car",
  "airplane",
  "ticket",
  "game-controller",
  "heart",
  "first-aid",
  "gift",
  "coins",
  "graduation-cap",
  "paw-print",
  "lightning",
  "phone",
  "t-shirt",
  "barbell",
  "briefcase",
] as const;

export type CategoryIcon = (typeof CATEGORY_ICONS)[number];

/** The icon of a category that was not given one, and of every category created before icons. */
export const DEFAULT_CATEGORY_ICON: CategoryIcon = "tag";

export class CategoryValidationError extends Error {
  constructor(
    /** English text for logs and tests: users read the translation of `ref`. */
    message: string,
    readonly ref: MessageRef,
    readonly field: "name" | "icon" = "name",
  ) {
    super(message);
    this.name = "CategoryValidationError";
  }
}

export function validateCategoryName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    throw new CategoryValidationError(
      "The category name is required",
      messageRef("categoryNameRequired"),
    );
  }
  return trimmed;
}

/** The icon to store: the default one when none is given, an error when it is not in the set. */
export function validateCategoryIcon(icon: string | undefined): CategoryIcon {
  if (icon === undefined) return DEFAULT_CATEGORY_ICON;
  const known = CATEGORY_ICONS.find((candidate) => candidate === icon);
  if (known === undefined) {
    throw new CategoryValidationError(
      `Unknown category icon "${icon}"`,
      messageRef("categoryIconUnknown"),
      "icon",
    );
  }
  return known;
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
    (category) => category.id !== ignoreId && category.name.toLowerCase() === wanted,
  );
  if (clash !== undefined) {
    throw new CategoryValidationError(
      `A category named "${clash.name}" already exists`,
      messageRef("categoryNameTaken", { name: clash.name }),
    );
  }
}

/** A category a transaction can newly choose: an archived one is hidden from pickers. */
function isCategoryAssignable(category: { archived: boolean }): boolean {
  return !category.archived;
}

/** What a picker offers, in the order given. It is the rule `assertCategoryAssignable` applies. */
export function listAssignableCategories<T extends { archived: boolean }>(
  categories: readonly T[],
): T[] {
  return categories.filter(isCategoryAssignable);
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
      messageRef("categoryOfTransfer"),
    );
  }
  if (!isCategoryAssignable(category)) {
    throw new TransactionValidationError(
      "categoryId",
      "This category is archived and cannot be assigned",
      messageRef("categoryArchived"),
    );
  }
}
