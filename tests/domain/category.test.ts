import { describe, expect, it } from "vitest";

import {
  assertCategoryAssignable,
  assertCategoryNameAvailable,
  CATEGORY_ICONS,
  CategoryValidationError,
  DEFAULT_CATEGORY_ICON,
  listAssignableCategories,
  validateCategoryIcon,
  validateCategoryName,
} from "../../src/domain/category";

describe("validateCategoryName", () => {
  it("trims the name of a valid category", () => {
    expect(validateCategoryName("  Groceries ")).toBe("Groceries");
  });

  it("rejects a blank name", () => {
    expect(() => validateCategoryName("   ")).toThrow(CategoryValidationError);
  });
});

describe("assertCategoryNameAvailable", () => {
  const existing = [
    { id: 1, name: "Groceries" },
    { id: 2, name: "Rent" },
  ];

  it("rejects a name already used, whatever its case", () => {
    expect(() => assertCategoryNameAvailable("groceries", existing)).toThrow(
      CategoryValidationError,
    );
  });

  it("accepts a new name", () => {
    expect(() => assertCategoryNameAvailable("Leisure", existing)).not.toThrow();
  });

  it("lets a category keep its own name when it is renamed", () => {
    expect(() => assertCategoryNameAvailable("GROCERIES", existing, { ignoreId: 1 })).not.toThrow();
  });
});

describe("assertCategoryAssignable", () => {
  const active = { id: 1, archived: false };
  const archived = { id: 2, archived: true };

  it("accepts an active category on an entered transaction", () => {
    expect(() => assertCategoryAssignable("expense", active)).not.toThrow();
    expect(() => assertCategoryAssignable("income", active)).not.toThrow();
    expect(() => assertCategoryAssignable("interest", active)).not.toThrow();
  });

  it("refuses any category on a transfer", () => {
    expect(() => assertCategoryAssignable("transfer", active)).toThrow(
      expect.objectContaining({
        name: "TransactionValidationError",
        field: "categoryId",
      }),
    );
  });

  it("refuses an archived category, which is hidden from pickers", () => {
    expect(() => assertCategoryAssignable("expense", archived)).toThrow(
      expect.objectContaining({ field: "categoryId" }),
    );
  });

  it("accepts no category at all, on any kind", () => {
    expect(() => assertCategoryAssignable("transfer", null)).not.toThrow();
    expect(() => assertCategoryAssignable("expense", null)).not.toThrow();
  });
});

describe("listAssignableCategories", () => {
  const categories = [
    { id: 1, name: "Groceries", archived: false },
    { id: 2, name: "Old", archived: true },
    { id: 3, name: "Rent", archived: false },
  ];

  it("keeps the categories a transaction can newly choose, in order", () => {
    expect(listAssignableCategories(categories).map(({ id }) => id)).toEqual([1, 3]);
  });

  it("agrees with the rule that refuses a category when it is assigned", () => {
    for (const category of categories) {
      const isListed = listAssignableCategories(categories).includes(category);
      const isAccepted = (() => {
        try {
          assertCategoryAssignable("expense", category);
          return true;
        } catch {
          return false;
        }
      })();

      expect(isListed).toBe(isAccepted);
    }
  });
});

describe("validateCategoryIcon", () => {
  it("accepts every icon of the set", () => {
    for (const icon of CATEGORY_ICONS) {
      expect(validateCategoryIcon(icon)).toBe(icon);
    }
  });

  it("falls back to the default icon when none is given", () => {
    expect(validateCategoryIcon(undefined)).toBe(DEFAULT_CATEGORY_ICON);
  });

  it("has a default icon that belongs to the set", () => {
    expect(CATEGORY_ICONS).toContain(DEFAULT_CATEGORY_ICON);
  });

  it("rejects an icon outside the set, on the icon field", () => {
    expect(() => validateCategoryIcon("rocket")).toThrow(CategoryValidationError);
    try {
      validateCategoryIcon("rocket");
    } catch (error) {
      expect(error).toMatchObject({ field: "icon" });
    }
  });

  it("rejects an empty icon", () => {
    expect(() => validateCategoryIcon("")).toThrow(CategoryValidationError);
  });
});

describe("the set of icons", () => {
  it("lists each icon once", () => {
    expect(new Set(CATEGORY_ICONS).size).toBe(CATEGORY_ICONS.length);
  });
});
