import { describe, expect, it } from "vitest";

import { consumeBackupCode, generateBackupCodes } from "../../src/auth/backup-codes";

import { at } from "./at";

describe("backup codes", () => {
  it("generates ten distinct codes readable in two groups", () => {
    const { codes } = generateBackupCodes();

    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    for (const code of codes) {
      expect(code).toMatch(/^[A-Z2-7]{5}-[A-Z2-7]{5}$/);
    }
  });

  it("stores one hash per code and never the code itself", () => {
    const { codes, hashes } = generateBackupCodes();

    expect(hashes).toHaveLength(codes.length);
    for (const code of codes) {
      expect(hashes.join("")).not.toContain(code);
      expect(hashes.join("")).not.toContain(code.replace("-", ""));
    }
  });

  it("consumes a valid code and returns the hashes that remain", () => {
    const { codes, hashes } = generateBackupCodes();

    const remaining = consumeBackupCode(hashes, at(codes, 3));

    expect(remaining).toHaveLength(9);
    expect(remaining).not.toContain(hashes[3]);
  });

  it("refuses a code a second time", () => {
    const { codes, hashes } = generateBackupCodes();
    const remaining = consumeBackupCode(hashes, at(codes, 0))!;

    expect(consumeBackupCode(remaining, at(codes, 0))).toBeNull();
  });

  it("refuses a code that was never issued", () => {
    const { hashes } = generateBackupCodes();

    expect(consumeBackupCode(hashes, "AAAAA-AAAAA")).toBeNull();
    expect(consumeBackupCode(hashes, "")).toBeNull();
  });

  it("ignores case, spaces and the dash when typed by the user", () => {
    const { codes, hashes } = generateBackupCodes();
    const typed = ` ${at(codes, 1).toLowerCase().replace("-", " ")} `;

    expect(consumeBackupCode(hashes, typed)).toHaveLength(9);
  });

  it("does not mutate the list it is given", () => {
    const { codes, hashes } = generateBackupCodes();
    const before = [...hashes];

    consumeBackupCode(hashes, at(codes, 0));

    expect(hashes).toEqual(before);
  });
});
