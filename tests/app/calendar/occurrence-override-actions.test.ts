import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  deleteOccurrenceOverrideAction,
  saveOccurrenceOverrideAction,
} from "../../../src/app/calendar/actions";
import { decodeFlash, FLASH_COOKIE } from "../../../src/app/feedback/flash-codec";
import { createAccount } from "../../../src/ledger/accounts";
import { createPlannedItem, getPlannedItem, saveOccurrenceOverride } from "../../../src/ledger/planned-items";
import { createTransaction } from "../../../src/ledger/transactions";
import { type AppDatabase, migrateDatabase, openDatabase } from "../../../src/storage/database";
import { translateKey } from "../translate-key";

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
vi.mock("../../../src/app/auth/session", () => ({ requireSession: async () => undefined }));
vi.mock("../../../src/app/translator", () => ({ getTranslator: async () => translateKey }));
vi.mock("../../../src/storage/with-database", () => ({
  withDatabase: <T>(work: (db: AppDatabase) => T): T => work(holder.db as AppDatabase),
}));

const NOMINAL_DATE = "2026-03-10";

function formOf(fields: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    formData.set(key, value);
  }
  return formData;
}

describe("occurrence override actions", () => {
  let dataDir: string;
  let db: AppDatabase;
  let accountId: number;
  let itemId: number;

  const flashed = () => decodeFlash(holder.jar.get(FLASH_COOKIE));
  const overridesOf = () => getPlannedItem(db, itemId).overrides;
  const save = (fields: Record<string, string>) =>
    saveOccurrenceOverrideAction(
      null,
      formOf({ itemId: String(itemId), nominalDate: NOMINAL_DATE, overrideDate: "", overrideAmount: "", ...fields }),
    );
  const restore = (fields: Record<string, string> = {}) =>
    deleteOccurrenceOverrideAction(null, formOf({ itemId: String(itemId), nominalDate: NOMINAL_DATE, ...fields }));

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
      name: "Streaming",
      kind: "expense",
      accountId,
      startDate: NOMINAL_DATE,
      repetition: { kind: "monthly_on_day", day: 10 },
      amount: -1_299,
    }).id;
  });

  afterEach(() => {
    db.$client.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("moves one occurrence and changes its amount, signed by the kind, then tells it", async () => {
    const state = await save({ intent: "save", overrideDate: "2026-03-12", overrideAmount: "15" });

    expect(state).toBeNull();
    expect(overridesOf()).toMatchObject([
      { nominalDate: NOMINAL_DATE, status: "modified", overrideDate: "2026-03-12", overrideAmount: -1_500 },
    ]);
    expect(holder.refreshData).toHaveBeenCalled();
    expect(flashed()).toMatchObject({ kind: "success", ref: { key: "occurrenceOverrideSaved" } });
  });

  it("skips one occurrence and tells it", async () => {
    const state = await save({ intent: "skip", overrideDate: "2026-03-12" });

    expect(state).toBeNull();
    expect(overridesOf()).toMatchObject([{ nominalDate: NOMINAL_DATE, status: "cancelled", overrideDate: null }]);
    expect(flashed()).toMatchObject({ kind: "success", ref: { key: "occurrenceSkipped" } });
  });

  it("shows the refusal of a zero amount on the amount field and keeps what was typed", async () => {
    const state = await save({ intent: "save", overrideAmount: "0" });

    expect(state).toEqual({
      field: "overrideAmount",
      message: "transactionAmountNonZero",
      values: { overrideDate: "", overrideAmount: "0" },
    });
    expect(overridesOf()).toEqual([]);
    expect(holder.refreshData).not.toHaveBeenCalled();
  });

  it("shows on the date field that a change needs a date or an amount", async () => {
    expect(await save({ intent: "save" })).toMatchObject({
      field: "overrideDate",
      message: "plannedItemOverrideEmpty",
    });
  });

  it("refuses a date the schedule does not produce, as a message of the form", async () => {
    const state = await saveOccurrenceOverrideAction(
      null,
      formOf({ itemId: String(itemId), nominalDate: "2026-03-11", intent: "skip" }),
    );

    expect(state).toEqual({
      message: "plannedItemOccurrenceNotProduced",
      values: { overrideDate: "", overrideAmount: "" },
    });
    expect(overridesOf()).toEqual([]);
  });

  it("refuses a linked occurrence: the transaction is unlinked first", async () => {
    db.$client.exec(`UPDATE planned_items SET accepts_multiple_transactions = 1 WHERE id = ${itemId}`);
    const transaction = createTransaction(db, {
      accountId,
      date: NOMINAL_DATE,
      kind: "expense",
      amount: -500,
      label: "STREAMING",
    });
    db.$client.exec(
      `UPDATE transactions SET planned_item_id = ${itemId}, occurrence_date = '${NOMINAL_DATE}' WHERE id = ${transaction.id}`,
    );

    expect(await save({ intent: "skip" })).toMatchObject({ message: "plannedItemOccurrenceLinked" });
    expect(overridesOf()).toEqual([]);
  });

  it.each(["", "0", "abc", "1.5"])("refuses the item id %j", async (id) => {
    const state = await saveOccurrenceOverrideAction(null, formOf({ itemId: id, nominalDate: NOMINAL_DATE, intent: "skip" }));

    expect(state).toMatchObject({ message: "plannedItemGone" });
    expect(overridesOf()).toEqual([]);
  });

  it("tells that the item no longer exists", async () => {
    const state = await saveOccurrenceOverrideAction(
      null,
      formOf({ itemId: String(itemId + 1), nominalDate: NOMINAL_DATE, intent: "skip" }),
    );

    expect(state).toEqual({ message: "plannedItemGone", values: { overrideDate: "", overrideAmount: "" } });
    expect(flashed()).toMatchObject({ kind: "error", ref: { key: "plannedItemGone" } });
  });

  it("restores the computed date and amount, then tells it", async () => {
    saveOccurrenceOverride(db, itemId, {
      nominalDate: NOMINAL_DATE,
      status: "cancelled",
      overrideDate: null,
      overrideAmount: null,
    });

    const state = await restore();

    expect(state).toBeNull();
    expect(overridesOf()).toEqual([]);
    expect(holder.refreshData).toHaveBeenCalled();
    expect(flashed()).toMatchObject({ kind: "success", ref: { key: "occurrenceRestored" } });
  });

  it("refuses to restore with a malformed nominal date, instead of telling a restore that did nothing", async () => {
    const state = await restore({ nominalDate: "garbage" });

    expect(state).toEqual({ message: "plannedItemDateInvalid" });
    expect(flashed()).toBeNull();
    expect(holder.refreshData).not.toHaveBeenCalled();
  });

  it("refuses to restore an occurrence of a cancelled item", async () => {
    db.$client.exec(`UPDATE planned_items SET cancelled = 1 WHERE id = ${itemId}`);

    expect(await restore()).toEqual({ message: "plannedItemOccurrenceOnCancelled" });
  });

  it("tells, in the form and in a toast, that the item to restore no longer exists", async () => {
    const state = await restore({ itemId: String(itemId + 1) });

    expect(state).toEqual({ message: "plannedItemGone" });
    expect(flashed()).toMatchObject({ kind: "error", ref: { key: "plannedItemGone" } });
  });
});
