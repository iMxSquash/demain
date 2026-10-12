import { describe, expect, it } from "vitest";

describe("test setup", () => {
  it("runs a test with strict TypeScript", () => {
    const sum: number = 1 + 2;

    expect(sum).toBe(3);
  });
});
