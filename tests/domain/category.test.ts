import { describe, expect, it } from "vitest";

import {
  assertCategoryAssignable,
  assertCategoryNameAvailable,
  CategoryValidationError,
  validateCategoryName,
} from "../../src/domain/category";

describe("validateCategoryName", () => {
  it("trims the name of a valid category", () => {
    expect(validateCategoryName("  Groceries ")).toBe("Groceries");
  });

  it("rejects a blank name", () => {
    expect(() => validateCategoryName("   ")).toThrow(
      CategoryValidationError,
    );
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
    expect(() =>
      assertCategoryNameAvailable("GROCERIES", existing, { ignoreId: 1 }),
    ).not.toThrow();
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
