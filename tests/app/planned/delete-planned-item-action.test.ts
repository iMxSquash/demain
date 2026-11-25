import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { deletePlannedItemAction } from "../../../src/app/planned/actions";
import { decodeFlash, FLASH_COOKIE } from "../../../src/app/feedback/flash-codec";
import { createAccount } from "../../../src/ledger/accounts";
import { linkTransactionToOccurrence } from "../../../src/ledger/planned-matching";
import { createPlannedItem, listPlannedItems } from "../../../src/ledger/planned-items";
import { createTransaction } from "../../../src/ledger/transactions";
import { type AppDatabase, migrateDatabase, openDatabase } from "../../../src/storage/database";

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
vi.mock("next/navigation", () => ({
  redirect: (location: string) => {
    throw new Error(`redirect:${location}`);
  },
}));
vi.mock("../../../src/app/data-cache", () => ({ refreshData: holder.refreshData }));
vi.mock("../../../src/app/auth/session", () => ({ requireSession: async () => undefined }));
vi.mock("../../../src/storage/with-database", () => ({
  withDatabase: <T>(work: (db: AppDatabase) => T): T => work(holder.db as AppDatabase),
}));

describe("deleting a planned item from its edit page", () => {
  let dataDir: string;
  let db: AppDatabase;
  let accountId: number;
  let itemId: number;

  const flashed = () => decodeFlash(holder.jar.get(FLASH_COOKIE));
  const remainingItems = () => listPlannedItems(db, { includeCancelled: true }).map(({ id }) => id);

  beforeEach(() => {
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
      name: "Gym",
      kind: "expense",
      accountId,
      startDate: "2026-01-05",
      repetition: { kind: "monthly_on_day", day: 5 },
      amount: -3_000,
    }).id;
  });

  afterEach(() => {
    db.$client.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("deletes the item, tells it and goes back to the list", async () => {
    await expect(deletePlannedItemAction(itemId)).rejects.toThrow("redirect:/planned");

    expect(remainingItems()).toEqual([]);
    expect(holder.refreshData).toHaveBeenCalledOnce();
    expect(flashed()).toMatchObject({ kind: "success", ref: { key: "plannedItemDeleted" } });
  });

  it("keeps an item linked to a transaction and says why, on the same page", async () => {
    const transaction = createTransaction(db, {
      accountId,
      date: "2026-01-05",
      amount: -3_000,
      kind: "expense",
      label: "Gym",
    });
    linkTransactionToOccurrence(db, { transactionId: transaction.id, plannedItemId: itemId, nominalDate: "2026-01-05" });

    await expect(deletePlannedItemAction(itemId)).resolves.toBeUndefined();

    expect(remainingItems()).toEqual([itemId]);
    expect(holder.refreshData).not.toHaveBeenCalled();
    expect(flashed()).toMatchObject({ kind: "error", ref: { key: "plannedItemHasTransactions" } });
  });
});
