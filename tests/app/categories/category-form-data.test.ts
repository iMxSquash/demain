import { describe, expect, it } from "vitest";

import {
  parseCategoryChoice as parse,
  readCategoryIcon,
} from "../../../src/app/categories/category-form-data";
import { translateKey } from "../translate-key";

const parseCategoryChoice = (formData: FormData) => parse(formData, translateKey);

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

describe("readCategoryIcon", () => {
  it("reads the posted icon as it is, the domain being the judge of the set", () => {
    const formData = new FormData();
    formData.set("icon", "basket");

    expect(readCategoryIcon(formData)).toBe("basket");
  });

  it("leaves it undefined when nothing is posted, so the default icon applies", () => {
    expect(readCategoryIcon(new FormData())).toBeUndefined();
    const blank = new FormData();
    blank.set("icon", "");
    expect(readCategoryIcon(blank)).toBeUndefined();
  });
});
