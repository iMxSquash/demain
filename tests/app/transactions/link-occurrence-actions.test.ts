import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { decodeFlash, FLASH_COOKIE } from "../../../src/app/feedback/flash-codec";
import {
  linkOccurrenceAction,
  unlinkOccurrenceAction,
} from "../../../src/app/transactions/actions";
import { createAccount } from "../../../src/ledger/accounts";
import { createPlannedItem } from "../../../src/ledger/planned-items";
import { createTransaction, getTransaction } from "../../../src/ledger/transactions";
import { type AppDatabase, migrateDatabase, openDatabase } from "../../../src/storage/database";

const NOW = new Date("2026-03-12T10:00:00Z");

const holder = vi.hoisted(() => ({
  db: null as unknown,
  jar: new Map<string, string>(),
  refreshData: vi.fn(),
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
vi.mock("../../../src/app/data-cache", () => ({ refreshData: holder.refreshData }));
vi.mock("next-intl/server", () => ({
  getLocale: async () => "en",
  getTimeZone: async () => "UTC",
}));
vi.mock("../../../src/app/auth/session", () => ({ requireSession: async () => undefined }));
vi.mock("../../../src/app/translator", () => ({ getTranslator: async () => undefined }));
vi.mock("../../../src/storage/with-database", () => ({
  withDatabase: <T>(work: (db: AppDatabase) => T): T => work(holder.db as AppDatabase),
}));

function chosen(key: string): FormData {
  const data = new FormData();
  data.set("occurrence", key);
  return data;
}

describe("manual planned link actions", () => {
  let dataDir: string;
  let db: AppDatabase;
  let accountId: number;
  let transactionId: number;
  let itemId: number;

  function flashed() {
    return decodeFlash(holder.jar.get(FLASH_COOKIE));
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    holder.jar.clear();
    holder.refreshData.mockClear();
    dataDir = mkdtempSync(path.join(tmpdir(), "demain-test-"));
    db = openDatabase(dataDir);
    migrateDatabase(db);
    holder.db = db;
    accountId = createAccount(db, {
      name: "Checking",
      kind: "checking",
      currency: "EUR",
      openingDate: "2026-01-01",
      openingBalance: 100_000,
    }).id;
    itemId = createPlannedItem(db, {
      name: "Streaming",
      kind: "expense",
      accountId,
      startDate: "2026-03-10",
      repetition: { kind: "monthly_on_day", day: 10 },
      amount: -1_299,
    }).id;
    transactionId = createTransaction(db, {
      accountId,
      date: "2026-03-10",
      kind: "expense",
      amount: -1_299,
      label: "STREAMING",
    }).id;
  });

  afterEach(() => {
    vi.useRealTimers();
    db.$client.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("links a proposed occurrence, tells it and leaves the category alone", async () => {
    await linkOccurrenceAction(transactionId, chosen(`${itemId}:2026-03-10`));

    expect(getTransaction(db, transactionId)).toMatchObject({
      plannedItemId: itemId,
      occurrenceDate: "2026-03-10",
      categoryId: null,
    });
    expect(holder.refreshData).toHaveBeenCalled();
    expect(flashed()).toMatchObject({ kind: "success", ref: { key: "occurrenceLinked" } });
  });

  it.each(["", "abc", "1:2026-3-10", "0:2026-03-10"])(
    "refuses the malformed key %j",
    async (key) => {
      await linkOccurrenceAction(transactionId, chosen(key));

      expect(getTransaction(db, transactionId).plannedItemId).toBeNull();
      expect(flashed()).toMatchObject({ kind: "error", ref: { key: "matchNotProposed" } });
    },
  );

  it("refuses an occurrence the ledger does not propose", async () => {
    await linkOccurrenceAction(transactionId, chosen(`${itemId}:2026-03-11`));

    expect(getTransaction(db, transactionId).plannedItemId).toBeNull();
    expect(flashed()).toMatchObject({ kind: "error", ref: { key: "matchNotProposed" } });
  });

  it("refuses a transaction of an archived account", async () => {
    db.$client.exec(`UPDATE accounts SET archived = 1 WHERE id = ${accountId}`);

    await linkOccurrenceAction(transactionId, chosen(`${itemId}:2026-03-10`));

    expect(getTransaction(db, transactionId).plannedItemId).toBeNull();
    expect(flashed()).toMatchObject({
      kind: "error",
      ref: { key: "transactionOnArchivedAccount" },
    });
  });

  it("unlinks a linked transaction and tells it", async () => {
    await linkOccurrenceAction(transactionId, chosen(`${itemId}:2026-03-10`));

    await unlinkOccurrenceAction(transactionId);

    expect(getTransaction(db, transactionId)).toMatchObject({
      plannedItemId: null,
      occurrenceDate: null,
    });
    expect(flashed()).toMatchObject({ kind: "success", ref: { key: "occurrenceUnlinked" } });
  });

  it("refuses a bad transaction id", async () => {
    await unlinkOccurrenceAction(0);

    expect(flashed()).toMatchObject({ kind: "error", ref: { key: "transactionGone" } });
  });
});
