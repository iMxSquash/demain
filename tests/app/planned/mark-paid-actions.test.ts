import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { markOccurrencePaidAction } from "../../../src/app/planned/actions";
import { decodeFlash, FLASH_COOKIE } from "../../../src/app/feedback/flash-codec";
import { createAccount } from "../../../src/ledger/accounts";
import { createPlannedItem } from "../../../src/ledger/planned-items";
import { listTransactions } from "../../../src/ledger/transactions";
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
vi.mock("next/navigation", () => ({
  redirect: (location: string) => {
    throw new Error(`redirect:${location}`);
  },
}));
vi.mock("next-intl/server", () => ({ getLocale: async () => "en", getTimeZone: async () => "Europe/Paris" }));
vi.mock("../../../src/app/data-cache", () => ({ refreshData: holder.refreshData }));
vi.mock("../../../src/app/auth/session", () => ({ requireSession: async () => undefined }));
vi.mock("../../../src/app/translator", () => ({ getTranslator: async () => translateKey }));
vi.mock("../../../src/storage/with-database", () => ({
  withDatabase: <T>(work: (db: AppDatabase) => T): T => work(holder.db as AppDatabase),
}));

const NOMINAL_DATE = "2026-03-10";

function formOf(fields: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) formData.set(key, value);
  return formData;
}

describe("marking an occurrence as paid from a form", () => {
  let dataDir: string;
  let db: AppDatabase;
  let transferId: number;

  const flashed = () => decodeFlash(holder.jar.get(FLASH_COOKIE));
  const mark = (fields: Record<string, string>) =>
    markOccurrencePaidAction(
      null,
      formOf({ itemId: String(transferId), nominalDate: NOMINAL_DATE, date: NOMINAL_DATE, amount: "800.00", ...fields }),
    );

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-03-12T10:00:00Z"));
    holder.jar.clear();
    holder.refreshData.mockClear();
    dataDir = mkdtempSync(path.join(tmpdir(), "demain-test-"));
    db = openDatabase(dataDir);
    migrateDatabase(db);
    holder.db = db;
    const details = { currency: "EUR", openingDate: "2026-01-01" };
    const checkingId = createAccount(db, { ...details, name: "Checking", kind: "checking", openingBalance: 100_000 }).id;
    const savingsId = createAccount(db, {
      ...details,
      name: "Savings",
      kind: "savings",
      openingBalance: 0,
      depositCeiling: 50_000,
    }).id;
    transferId = createPlannedItem(db, {
      name: "Savings transfer",
      kind: "transfer",
      accountId: checkingId,
      destinationAccountId: savingsId,
      startDate: NOMINAL_DATE,
      repetition: { kind: "monthly_on_day", day: 10 },
      amount: -80_000,
    }).id;
  });

  afterEach(() => {
    vi.useRealTimers();
    db.$client.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("shows the surplus step first, with the values its split was computed for", async () => {
    const state = await mark({});

    expect(state).toMatchObject({ status: "surplus", values: { date: NOMINAL_DATE, amount: "800.00" } });
    expect(listTransactions(db)).toEqual([]);
  });

  it("applies a decision taken on the values the step showed", async () => {
    const state = await mark({ decision: "room-only", decidedDate: NOMINAL_DATE, decidedAmount: "800.00" });

    expect(state).toBeNull();
    expect(listTransactions(db).map(({ amount }) => amount)).toEqual([-50_000, 50_000]);
    expect(flashed()?.ref).toMatchObject({ key: "transferUnplaced" });
  });

  it("does not apply a decision taken on another amount: the step is shown again", async () => {
    const state = await mark({ decision: "room-only", decidedDate: NOMINAL_DATE, decidedAmount: "300.00" });

    expect(state).toMatchObject({ status: "surplus", values: { amount: "800.00" } });
    expect(listTransactions(db)).toEqual([]);
  });

  it("says that an item is gone when its id is unknown", async () => {
    const state = await markOccurrencePaidAction(
      null,
      formOf({ itemId: "9999", nominalDate: NOMINAL_DATE, date: NOMINAL_DATE, amount: "10.00" }),
    );

    expect(state).toMatchObject({ status: "error", message: "plannedItemGone" });
    expect(flashed()?.ref).toEqual({ key: "plannedItemGone" });
  });
});
