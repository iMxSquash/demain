import { describe, expect, it } from "vitest";

import { decodeFlash, encodeFlash, type Flash } from "../../../src/app/feedback/flash-codec";

const FLASH: Flash = {
  id: "7f3a",
  kind: "success",
  ref: { key: "accountCreated" },
};

describe("flash cookie codec", () => {
  it("restores what it encoded", () => {
    expect(decodeFlash(encodeFlash(FLASH))).toEqual(FLASH);
  });

  it("keeps the values of a message", () => {
    const withValues: Flash = {
      id: "1",
      kind: "error",
      ref: { key: "backupFileTooLarge", values: { max: 20 } },
    };

    expect(decodeFlash(encodeFlash(withValues))).toEqual(withValues);
  });

  it("returns null when there is no cookie", () => {
    expect(decodeFlash(undefined)).toBeNull();
  });

  it("ignores a cookie that is not JSON", () => {
    expect(decodeFlash("not json")).toBeNull();
  });

  it("ignores a cookie with an unknown kind", () => {
    const raw = JSON.stringify({ ...FLASH, kind: "warning" });

    expect(decodeFlash(raw)).toBeNull();
  });

  it("ignores a cookie whose key is not a feedback message", () => {
    const raw = JSON.stringify({ ...FLASH, ref: { key: "somethingPlanted" } });

    expect(decodeFlash(raw)).toBeNull();
  });

  it("ignores a cookie whose values are not text or numbers", () => {
    const raw = JSON.stringify({ ...FLASH, ref: { key: "accountCreated", values: { a: {} } } });

    expect(decodeFlash(raw)).toBeNull();
  });

  it("ignores a cookie without an id", () => {
    const raw = JSON.stringify({ kind: "success", ref: { key: "accountCreated" } });

    expect(decodeFlash(raw)).toBeNull();
  });
});
