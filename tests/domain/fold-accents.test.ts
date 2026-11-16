import { describe, expect, it } from "vitest";

import { foldAccents } from "../../src/domain/fold-accents";

describe("foldAccents", () => {
  it("lowercases and removes accents", () => {
    expect(foldAccents("Épargne Été")).toBe("epargne ete");
  });

  it("keeps spaces, digits and punctuation", () => {
    expect(foldAccents("Sous-total 2")).toBe("sous-total 2");
  });

  it("returns an empty string unchanged", () => {
    expect(foldAccents("")).toBe("");
  });
});
