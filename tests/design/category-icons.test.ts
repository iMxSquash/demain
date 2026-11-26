import { describe, expect, it } from "vitest";

import { CATEGORY_ICON_COMPONENTS, categoryIconOf } from "../../src/components/category-icons";
import { CATEGORY_ICONS, DEFAULT_CATEGORY_ICON } from "../../src/domain/category";

describe("category icons", () => {
  it("draws every icon of the closed set of the domain", () => {
    for (const icon of CATEGORY_ICONS) {
      expect(CATEGORY_ICON_COMPONENTS[icon], icon).toBeDefined();
    }
  });

  it("has no drawing for a key the domain does not list", () => {
    expect(Object.keys(CATEGORY_ICON_COMPONENTS).sort()).toEqual([...CATEGORY_ICONS].sort());
  });

  it("falls back to the default drawing for an unknown stored key", () => {
    expect(categoryIconOf("rocket")).toBe(CATEGORY_ICON_COMPONENTS[DEFAULT_CATEGORY_ICON]);
  });
});
