import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createTransactionAction,
  createTransferAction,
} from "../../../src/app/transactions/actions";
import { createAccount } from "../../../src/ledger/accounts";
import { setDefaultPaymentMode } from "../../../src/ledger/default-payment-mode";
import { listTransactions } from "../../../src/ledger/transactions";
import { type AppDatabase, migrateDatabase, openDatabase } from "../../../src/storage/database";
import { translateKey } from "../translate-key";

const holder = vi.hoisted(() => ({
  db: null as unknown,
  jar: new Map<string, string>(),
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
vi.mock("next-intl/server", () => ({
  getLocale: async () => "en",
  getTimeZone: async () => "UTC",
}));
vi.mock("../../../src/app/auth/session", () => ({ requireSession: async () => undefined }));
vi.mock("../../../src/app/translator", () => ({ getTranslator: async () => translateKey }));
vi.mock("../../../src/storage/with-database", () => ({
  withDatabase: <T>(work: (db: AppDatabase) => T): T => work(holder.db as AppDatabase),
}));

function formOf(fields: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) formData.set(key, value);
  return formData;
}

describe("creating transactions from the add form", () => {
  let dataDir: string;
  let db: AppDatabase;
  let checkingId: number;
  let savingsId: number;

  beforeEach(() => {
    holder.jar.clear();
    dataDir = mkdtempSync(path.join(tmpdir(), "demain-test-"));
    db = openDatabase(dataDir);
    migrateDatabase(db);
    holder.db = db;
    const account = (name: string, kind: "checking" | "savings") =>
      createAccount(db, {
        name,
        kind,
        currency: "EUR",
        openingDate: "2026-01-01",
        openingBalance: 100_000,
      }).id;
    checkingId = account("Checking", "checking");
    savingsId = account("Savings", "savings");
  });

  afterEach(() => {
    db.$client.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("starts the next entry with the default payment mode, not the one just used", async () => {
    setDefaultPaymentMode(db, "direct_debit");

    const state = await createTransactionAction(
      null,
      formOf({
        accountId: String(checkingId),
        date: "2026-03-15",
        kind: "expense",
        amount: "12,50",
        label: "Groceries",
        paymentMode: "card",
      }),
    );

    expect(state).toMatchObject({ status: "saved", values: { paymentMode: "direct_debit" } });
    expect(listTransactions(db).at(-1)?.paymentMode).toBe("card");
  });

  it("records a transfer as transfer on both legs, even with a payment mode posted", async () => {
    setDefaultPaymentMode(db, "card");

    const state = await createTransferAction(
      null,
      formOf({
        kind: "transfer",
        sourceId: String(checkingId),
        destinationId: String(savingsId),
        date: "2026-03-15",
        amount: "100",
        label: "Savings",
        paymentMode: "card",
      }),
    );

    expect(state).toMatchObject({ status: "saved" });
    expect(listTransactions(db).map((transaction) => transaction.paymentMode)).toEqual([
      "transfer",
      "transfer",
    ]);
  });
});
