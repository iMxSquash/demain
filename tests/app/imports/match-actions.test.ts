import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  confirmMatchAction,
  listBatchMatchesAction,
  undoMatchAction,
} from "../../../src/app/imports/match-actions";
import { createAccount } from "../../../src/ledger/accounts";
import { commitImport, type ImportRow } from "../../../src/ledger/imports";
import { createPlannedItem } from "../../../src/ledger/planned-items";
import { listTransactions, type Transaction } from "../../../src/ledger/transactions";
import { type AppDatabase, migrateDatabase, openDatabase } from "../../../src/storage/database";
import { translateKey } from "../translate-key";

const TODAY = "2026-03-12";
const NOW = new Date("2026-03-12T10:00:00Z");

const holder = vi.hoisted(() => ({
  db: null as unknown,
  withDatabase: vi.fn(),
  refreshData: vi.fn(),
}));

vi.mock("../../../src/app/data-cache", () => ({ refreshData: holder.refreshData }));
vi.mock("next-intl/server", () => ({
  getLocale: async () => "en",
  getTimeZone: async () => "UTC",
  getTranslations: async () => (key: string, values?: Record<string, unknown>) =>
    values === undefined ? key : `${key} ${JSON.stringify(values)}`,
}));
vi.mock("../../../src/app/auth/session", () => ({ requireSession: async () => undefined }));
vi.mock("../../../src/app/translator", () => ({ getTranslator: async () => translateKey }));
vi.mock("../../../src/storage/with-database", () => ({
  withDatabase: <T>(work: (db: AppDatabase) => T): T => {
    holder.withDatabase();
    return work(holder.db as AppDatabase);
  },
}));

function row(date: string, amount: number, label: string): ImportRow {
  return { date, amount, label, externalId: null };
}

describe("planned match actions", () => {
  let dataDir: string;
  let db: AppDatabase;
  let accountId: number;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    holder.withDatabase.mockClear();
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
  });

  afterEach(() => {
    vi.useRealTimers();
    db.$client.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  function importFile(rows: ImportRow[]): number {
    const { batchId } = commitImport(db, {
      accountId,
      format: "ofx",
      fileName: "statement.file",
      mapping: null,
      rows,
      now: NOW,
      today: TODAY,
    });
    if (batchId === null) throw new Error("The import created no batch");
    return batchId;
  }

  function item(name: string, amount: number, day: number) {
    return createPlannedItem(db, {
      name,
      kind: "expense",
      accountId,
      startDate: `2026-03-${String(day).padStart(2, "0")}`,
      repetition: { kind: "monthly_on_day", day },
      amount,
    });
  }

  function transactionLabelled(label: string): Transaction {
    const found = listTransactions(db).find((transaction) => transaction.label === label);
    if (found === undefined) throw new Error(`No transaction labelled ${label}`);
    return found;
  }

  /** A streaming row matched automatically and an ambiguous gym row. */
  function importMixedBatch() {
    item("Streaming", -1_299, 10);
    const gymA = item("Gym A", -999, 12);
    item("Gym B", -999, 12);
    const batchId = importFile([
      row("2026-03-10", -1_299, "STREAMING"),
      row("2026-03-12", -999, "GYM"),
    ]);
    const gymRow = transactionLabelled("GYM");
    const pair = { transactionId: gymRow.id, plannedItemId: gymA.id, nominalDate: "2026-03-12" };
    return { batchId, pair, streamingRow: transactionLabelled("STREAMING") };
  }

  const ERROR_FAILED = { status: "error", message: "plannedMatchesFailed" };

  describe("invalid arguments", () => {
    it.each([0, -1, 1.5, Number.NaN])("refuses the batch id %s before any read", async (id) => {
      expect(await listBatchMatchesAction(id)).toEqual(ERROR_FAILED);
      expect(await undoMatchAction(id, 1)).toEqual({
        status: "error",
        message: "plannedMatchUndoFailed",
      });
      expect(holder.withDatabase).not.toHaveBeenCalled();
    });

    it("refuses a bad transaction id before any read", async () => {
      expect(await undoMatchAction(1, 0)).toEqual({
        status: "error",
        message: "plannedMatchUndoFailed",
      });
      expect(await undoMatchAction(1, 2.5)).toEqual({
        status: "error",
        message: "plannedMatchUndoFailed",
      });
      expect(holder.withDatabase).not.toHaveBeenCalled();
    });

    it.each([
      ["an extra field", { transactionId: 1, plannedItemId: 1, nominalDate: TODAY, extra: 1 }],
      ["a bad date", { transactionId: 1, plannedItemId: 1, nominalDate: "12/03/2026" }],
      ["a zero id", { transactionId: 1, plannedItemId: 0, nominalDate: TODAY }],
      ["a missing field", { transactionId: 1, nominalDate: TODAY }],
    ])("refuses a pair with %s before any read", async (_name, pair) => {
      const state = await confirmMatchAction(1, pair as never);

      expect(state).toEqual({ status: "error", message: "plannedMatchConfirmFailed" });
      expect(holder.withDatabase).not.toHaveBeenCalled();
      expect(holder.refreshData).not.toHaveBeenCalled();
    });
  });

  describe("listing", () => {
    it("lists the matched transactions and the proposed groups", async () => {
      const { batchId, pair, streamingRow } = importMixedBatch();

      const state = await listBatchMatchesAction(batchId);

      if (state.status !== "ready") throw new Error("not ready");
      expect(state.matched).toMatchObject([
        { transactionId: streamingRow.id, plannedItemName: "Streaming", amount: -1_299 },
      ]);
      expect(state.groups).toHaveLength(1);
      expect(state.groups[0]!.options.map((option) => option.pair)).toContainEqual(pair);
      expect(holder.refreshData).not.toHaveBeenCalled();
    });

    it("refuses an unknown batch", async () => {
      expect(await listBatchMatchesAction(999)).toEqual({
        status: "error",
        message: "importBatchGone",
      });
    });
  });

  describe("confirming", () => {
    it("links a proposed pair and refreshes the data once", async () => {
      const { batchId, pair } = importMixedBatch();

      const state = await confirmMatchAction(batchId, pair);

      expect(state).toEqual({ status: "done", message: "confirmed" });
      expect(transactionLabelled("GYM").plannedItemId).toBe(pair.plannedItemId);
      expect(holder.refreshData).toHaveBeenCalledTimes(1);
    });

    it("refuses a forged pair without refreshing the data", async () => {
      const { batchId, pair } = importMixedBatch();

      const state = await confirmMatchAction(batchId, { ...pair, plannedItemId: 9_999 });

      expect(state).toEqual({ status: "error", message: "matchNotProposed" });
      expect(transactionLabelled("GYM").plannedItemId).toBeNull();
      expect(holder.refreshData).not.toHaveBeenCalled();
    });

    it("refuses a stale pair once it is linked", async () => {
      const { batchId, pair } = importMixedBatch();
      await confirmMatchAction(batchId, pair);
      holder.refreshData.mockClear();

      const state = await confirmMatchAction(batchId, pair);

      expect(state).toEqual({ status: "error", message: "matchNotProposed" });
      expect(holder.refreshData).not.toHaveBeenCalled();
    });

    it("refuses an unknown batch", async () => {
      expect(
        await confirmMatchAction(999, { transactionId: 1, plannedItemId: 1, nominalDate: TODAY }),
      ).toEqual({ status: "error", message: "importBatchGone" });
      expect(holder.refreshData).not.toHaveBeenCalled();
    });
  });

  describe("undoing", () => {
    it("unlinks an automatic match and refreshes the data once", async () => {
      const { batchId, streamingRow } = importMixedBatch();

      const state = await undoMatchAction(batchId, streamingRow.id);

      expect(state).toEqual({ status: "done", message: "undone" });
      expect(transactionLabelled("STREAMING").plannedItemId).toBeNull();
      expect(holder.refreshData).toHaveBeenCalledTimes(1);
    });

    it("refuses the transaction of another batch", async () => {
      const { batchId } = importMixedBatch();
      const otherBatchId = importFile([row("2026-03-11", -50, "OTHER")]);
      expect(otherBatchId).not.toBe(batchId);

      const state = await undoMatchAction(otherBatchId, transactionLabelled("STREAMING").id);

      expect(state).toEqual({ status: "error", message: "matchNotInBatch" });
      expect(transactionLabelled("STREAMING").plannedItemId).not.toBeNull();
      expect(holder.refreshData).not.toHaveBeenCalled();
    });

    it("refuses an unknown batch", async () => {
      expect(await undoMatchAction(999, 1)).toEqual({
        status: "error",
        message: "importBatchGone",
      });
    });
  });
});
