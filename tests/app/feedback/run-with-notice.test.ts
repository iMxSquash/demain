import { beforeEach, describe, expect, it, vi } from "vitest";

import { messageRef } from "../../../src/domain/message";
import { runWithNotice } from "../../../src/app/feedback/flash";
import { decodeFlash, FLASH_COOKIE, type Flash } from "../../../src/app/feedback/flash-codec";

const jar = vi.hoisted(() => ({ values: new Map<string, string>() }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    set: (name: string, value: string) => jar.values.set(name, value),
    get: (name: string) => {
      const value = jar.values.get(name);
      return value === undefined ? undefined : { value };
    },
  }),
}));

function flashed(): Flash | null {
  return decodeFlash(jar.values.get(FLASH_COOKIE));
}

describe("runWithNotice", () => {
  beforeEach(() => {
    jar.values.clear();
  });

  it("tells the success of a change", async () => {
    await runWithNotice(() => undefined, {
      success: "accountArchived",
      describeFailure: () => messageRef("nothingSaved"),
    });

    expect(flashed()).toMatchObject({ kind: "success", ref: { key: "accountArchived" } });
  });

  it("tells why a change was refused instead of throwing", async () => {
    await runWithNotice(
      () => {
        throw new Error("database is locked");
      },
      { success: "accountArchived", describeFailure: () => messageRef("accountNotArchived") },
    );

    expect(flashed()).toMatchObject({ kind: "error", ref: { key: "accountNotArchived" } });
  });

  it("stays silent about a success that has no message", async () => {
    await runWithNotice(() => undefined, { describeFailure: () => messageRef("nothingSaved") });

    expect(flashed()).toBeNull();
  });

  it("never puts what was thrown in the notice", async () => {
    await runWithNotice(
      () => {
        throw new Error("SELECT balance FROM accounts WHERE id = 3");
      },
      { describeFailure: () => messageRef("nothingSaved") },
    );

    expect(jar.values.get(FLASH_COOKIE)).not.toContain("SELECT");
  });
});
