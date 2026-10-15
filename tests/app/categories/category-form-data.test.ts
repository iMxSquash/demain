import { describe, expect, it } from "vitest";

import { parseCategoryChoice } from "../../../src/app/categories/category-form-data";

function formOf(categoryId?: string): FormData {
  const formData = new FormData();
  if (categoryId !== undefined) formData.set("categoryId", categoryId);
  return formData;
}

describe("parseCategoryChoice", () => {
  it("reads the chosen category id", () => {
    expect(parseCategoryChoice(formOf("4"))).toEqual({ ok: true, categoryId: 4 });
  });

  it("asks for a category when none is chosen", () => {
    expect(parseCategoryChoice(formOf(""))).toMatchObject({ ok: false });
    expect(parseCategoryChoice(formOf())).toMatchObject({ ok: false });
  });

  it("refuses an id that is not a whole number", () => {
    expect(parseCategoryChoice(formOf("groceries"))).toMatchObject({ ok: false });
    expect(parseCategoryChoice(formOf("1.5"))).toMatchObject({ ok: false });
  });
});
