import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { checkBatchBalanceAction } from "../../../src/app/imports/checks-actions";
import { createAccount } from "../../../src/ledger/accounts";
import { commitImport } from "../../../src/ledger/imports";
import {
  type AppDatabase,
  migrateDatabase,
  openDatabase,
} from "../../../src/storage/database";
import { translateKey } from "../translate-key";

const holder = vi.hoisted(() => ({ db: null as unknown }));

vi.mock("next-intl/server", () => ({
  getLocale: async () => "en",
  getTranslations: async () => (key: string, values?: Record<string, unknown>) =>
    values === undefined ? key : `${key} ${JSON.stringify(values)}`,
}));
vi.mock("../../../src/app/auth/session", () => ({ requireSession: async () => undefined }));
vi.mock("../../../src/app/translator", () => ({ getTranslator: async () => translateKey }));
vi.mock("../../../src/storage/with-database", () => ({
  withDatabase: <T>(work: (db: AppDatabase) => T): T => work(holder.db as AppDatabase),
}));

const OPENING_BALANCE = 100_000;
const COMPUTED_AT_END = OPENING_BALANCE - 1_250 - 5_000;

describe("checkBatchBalanceAction", () => {
  let dataDir: string;
  let db: AppDatabase;
  let batchId: number;

  beforeEach(() => {
    dataDir = mkdtempSync(path.join(tmpdir(), "demain-test-"));
    db = openDatabase(dataDir);
    migrateDatabase(db);
    holder.db = db;
    const accountId = createAccount(db, {
      name: "Checking",
      kind: "checking",
      currency: "EUR",
      openingDate: "2026-01-01",
      openingBalance: OPENING_BALANCE,
    }).id;
    const result = commitImport(db, {
      accountId,
      rows: [
        { date: "2026-03-02", amount: -1_250, label: "CARD SHOP", externalId: null },
        { date: "2026-03-30", amount: -5_000, label: "RENT", externalId: null },
      ],
      format: "csv",
      fileName: "march.csv",
      mapping: null,
      now: new Date("2026-04-15T10:00:00Z"),
    });
    if (result.batchId === null) throw new Error("nothing was imported");
    batchId = result.batchId;
  });

  afterEach(() => {
    db.$client.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("says the balances match when the typed value is the computed balance", async () => {
    const state = await checkBatchBalanceAction(batchId, "937,50");

    expect(COMPUTED_AT_END).toBe(93_750);
    expect(state.status).toBe("gap");
    expect(state.message).toContain("gapMatch");
    expect(state.message).toContain('"date":"Mar 30, 2026"');
  });

  it("says Demain holds more than the bank when the gap is positive", async () => {
    const state = await checkBatchBalanceAction(batchId, "903,00");

    expect(state.status).toBe("gap");
    expect(state.message).toContain("gapMore");
    expect(state.message).toContain("€34.50");
  });

  it("says Demain holds less than the bank when the gap is negative", async () => {
    const state = await checkBatchBalanceAction(batchId, "1 143,88");

    expect(state.status).toBe("gap");
    expect(state.message).toContain("gapLess");
    expect(state.message).toContain("€206.38");
  });

  it("refuses an empty text and computes nothing", async () => {
    const state = await checkBatchBalanceAction(batchId, "");

    expect(state).toEqual({ status: "error", message: "realBalanceRequired" });
  });

  it("refuses an invalid text and computes nothing", async () => {
    const state = await checkBatchBalanceAction(batchId, "abc");

    expect(state.status).toBe("error");
    expect(state.message).not.toContain("gap");
  });

  it("refuses an unknown batch", async () => {
    const state = await checkBatchBalanceAction(999, "937,50");

    expect(state).toEqual({ status: "error", message: "importBatchGone" });
  });

  it("refuses a batch id that is not a positive integer", async () => {
    const state = await checkBatchBalanceAction(1.5, "937,50");

    expect(state).toEqual({ status: "error", message: "balanceCheckFailed" });
  });
});
