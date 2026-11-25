import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { refreshData } from "../../../src/app/data-cache";
import { decodeFlash, FLASH_COOKIE } from "../../../src/app/feedback/flash-codec";
import { setDefaultPaymentModeAction } from "../../../src/app/settings/actions";
import { getDefaultPaymentMode } from "../../../src/ledger/default-payment-mode";
import { type AppDatabase, migrateDatabase, openDatabase } from "../../../src/storage/database";

const holder = vi.hoisted(() => ({
  db: null as unknown,
  jar: new Map<string, string>(),
  requireSession: vi.fn(async () => undefined),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    set: (name: string, value: string) => holder.jar.set(name, value),
    get: (name: string) => {
      const value = holder.jar.get(name);
      return value === undefined ? undefined : { value };
    },
  }),
}));
vi.mock("../../../src/app/data-cache", () => ({ refreshData: vi.fn() }));
vi.mock("../../../src/app/auth/session", () => ({ requireSession: holder.requireSession }));
vi.mock("../../../src/storage/with-database", () => ({
  withDatabase: <T>(work: (db: AppDatabase) => T): T => work(holder.db as AppDatabase),
}));

function formOf(fields: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) formData.set(key, value);
  return formData;
}

function readFlashCookie() {
  return decodeFlash(holder.jar.get(FLASH_COOKIE));
}

describe("saving the default payment mode from the settings", () => {
  let dataDir: string;
  let db: AppDatabase;

  beforeEach(() => {
    holder.jar.clear();
    holder.requireSession.mockClear();
    vi.mocked(refreshData).mockClear();
    dataDir = mkdtempSync(path.join(tmpdir(), "demain-test-"));
    db = openDatabase(dataDir);
    migrateDatabase(db);
    holder.db = db;
  });

  afterEach(() => {
    db.$client.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("stores the posted mode, refreshes the cached reads and says so in a toast", async () => {
    await setDefaultPaymentModeAction(formOf({ paymentMode: "direct_debit" }));

    expect(holder.requireSession).toHaveBeenCalledOnce();
    expect(getDefaultPaymentMode(db)).toBe("direct_debit");
    expect(refreshData).toHaveBeenCalledOnce();
    expect(readFlashCookie()).toMatchObject({
      kind: "success",
      ref: { key: "defaultPaymentModeSaved" },
    });
  });

  // Only a tampered post can refuse a value, and a toast never echoes posted text (ADR-015).
  it("stores nothing for an unknown mode and flashes a toast without the posted value", async () => {
    await setDefaultPaymentModeAction(formOf({ paymentMode: "cheque" }));

    expect(getDefaultPaymentMode(db)).toBe("card");
    expect(refreshData).not.toHaveBeenCalled();
    expect(readFlashCookie()).toMatchObject({ kind: "error" });
    expect(readFlashCookie()?.ref).toEqual({ key: "nothingSaved" });
    expect(holder.jar.get(FLASH_COOKIE)).not.toContain("cheque");
  });

  it("stores nothing when no mode is posted and flashes a toast without values", async () => {
    await setDefaultPaymentModeAction(formOf({}));

    expect(getDefaultPaymentMode(db)).toBe("card");
    expect(readFlashCookie()).toMatchObject({ kind: "error" });
    expect(readFlashCookie()?.ref).toEqual({ key: "nothingSaved" });
  });

  it("checks the session before reading the form", async () => {
    holder.requireSession.mockRejectedValueOnce(new Error("redirect:/login"));

    await expect(
      setDefaultPaymentModeAction(formOf({ paymentMode: "transfer" })),
    ).rejects.toThrow("redirect:/login");
    expect(getDefaultPaymentMode(db)).toBe("card");
  });
});
