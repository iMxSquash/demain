import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { commitStagedFileAction } from "../../../src/app/imports/stage-actions";
import type { CommitStagedRequest } from "../../../src/app/imports/commit-request";
import { createAccount, getAccountBalance, updateAccount } from "../../../src/ledger/accounts";
import { createCategory } from "../../../src/ledger/categories";
import { listTransactions } from "../../../src/ledger/transactions";
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
vi.mock("../../../src/app/revalidate-ledger", () => ({ revalidateLedger: () => undefined }));
vi.mock("../../../src/app/feedback/flash", () => ({
  flashSuccess: async () => undefined,
  flashError: async () => undefined,
}));
vi.mock("../../../src/storage/with-database", () => ({
  withDatabase: <T>(work: (db: AppDatabase) => T): T => work(holder.db as AppDatabase),
}));

const CHECKING_ID = 1;
const A_ID = 2;
const B_ID = 3;
const ACCOUNT = { currency: "EUR", openingDate: "2026-01-01" };

const EXPENSE_DETAILS = {
  type: "expense",
  categoryId: null,
  paymentMode: null,
  description: null,
  savingsAccountId: null,
} as const;

function draft(overrides: Record<string, unknown> = {}) {
  return {
    date: "2026-03-02",
    label: "CARD SHOP",
    amount: "-12,50",
    externalId: null,
    ...overrides,
  };
}

function savingsDraft(savingsAccountId: number | null, overrides: Record<string, unknown> = {}) {
  return draft({
    date: "2026-03-10",
    label: "VIR LIVRET",
    amount: "-300,00",
    details: { ...EXPENSE_DETAILS, type: "savings", savingsAccountId },
    ...overrides,
  });
}

describe("commitStagedFileAction", () => {
  let dataDir: string;
  let db: AppDatabase;

  beforeEach(() => {
    dataDir = mkdtempSync(path.join(tmpdir(), "demain-test-"));
    db = openDatabase(dataDir);
    migrateDatabase(db);
    holder.db = db;
    createAccount(db, { ...ACCOUNT, name: "Checking", kind: "checking", openingBalance: 100_000 });
    const a = createAccount(db, {
      ...ACCOUNT,
      name: "A",
      kind: "savings",
      openingBalance: 90_000,
      depositCeiling: 100_000,
    });
    const b = createAccount(db, { ...ACCOUNT, name: "B", kind: "savings", openingBalance: 0 });
    updateAccount(db, a.id, {
      ...ACCOUNT,
      name: "A",
      kind: "savings",
      openingBalance: 90_000,
      depositCeiling: 100_000,
      overflowAccountId: b.id,
    });
  });

  afterEach(() => {
    db.$client.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  function commit(drafts: unknown[], extra: Record<string, unknown> = {}) {
    return commitStagedFileAction({
      accountId: CHECKING_ID,
      fileName: "2026-03.csv",
      format: "csv",
      mapping: null,
      drafts,
      ...extra,
    } as CommitStagedRequest);
  }

  it("records the type, category, payment mode and description the user chose", async () => {
    const groceries = createCategory(db, { name: "Groceries" });

    const state = await commit([
      draft({
        details: {
          type: "expense",
          categoryId: groceries.id,
          paymentMode: "card",
          description: "weekly shop",
          savingsAccountId: null,
        },
      }),
    ]);

    expect(state.status).toBe("done");
    expect(listTransactions(db)[0]).toMatchObject({
      kind: "expense",
      categoryId: groceries.id,
      paymentMode: "card",
      description: "weekly shop",
    });
  });

  it("records a savings row on the savings account the row names", async () => {
    const state = await commit([savingsDraft(A_ID)]);

    expect(state.status).toBe("done");
    expect(getAccountBalance(db, A_ID)).toBe(100_000);
    expect(getAccountBalance(db, B_ID)).toBe(20_000);
  });

  it("takes the savings account of the request for a row that names none", async () => {
    const state = await commit([savingsDraft(null)], { savingsAccountId: A_ID });

    expect(state.status).toBe("done");
    expect(getAccountBalance(db, A_ID)).toBe(100_000);
  });

  it("refuses a request that carries a field it does not know, and records nothing", async () => {
    const state = await commit([draft({ details: { ...EXPENSE_DETAILS, kind: "transfer" } })]);

    expect(state.status).toBe("error");
    expect(listTransactions(db)).toEqual([]);
  });

  it("names the rows still invalid, and records nothing", async () => {
    const state = await commit([
      draft({ details: EXPENSE_DETAILS }),
      draft({ amount: "12,50", details: EXPENSE_DETAILS }),
    ]);

    expect(state).toMatchObject({
      status: "invalid",
      problems: [{ index: 1, problem: "typeSignMismatch" }],
    });
    expect(listTransactions(db)).toEqual([]);
  });

  describe("when the ledger blocks the file", () => {
    it("says why, in words and with the row, and records nothing", async () => {
      updateAccount(db, A_ID, {
        ...ACCOUNT,
        name: "A",
        kind: "savings",
        openingBalance: 90_000,
        depositCeiling: 100_000,
        overflowAccountId: null,
      });

      const state = await commit([draft({ details: EXPENSE_DETAILS }), savingsDraft(A_ID)]);

      expect(state.status).toBe("blocked");
      expect(state.issues).toHaveLength(1);
      expect(state.issues[0]?.index).toBe(1);
      expect(state.issues[0]?.message).toContain("savingsUnplaced");
      expect(state.issues[0]?.message).toContain("VIR LIVRET");
      expect(listTransactions(db)).toEqual([]);
    });

    it("reports a savings account archived since the review", async () => {
      db.$client.exec("update accounts set archived = 1 where id = 2");

      const state = await commit([savingsDraft(A_ID)]);

      expect(state.status).toBe("blocked");
      expect(state.issues[0]?.message).toContain("importSavingsAccountArchived");
      expect(listTransactions(db)).toEqual([]);
    });

    it("reports a category deleted since the review", async () => {
      const state = await commit([draft({ details: { ...EXPENSE_DETAILS, categoryId: 999 } })]);

      expect(state.status).toBe("blocked");
      expect(state.issues[0]?.message).toContain("importCategoryUnknown");
    });

    it("points at no row for a loop in the chain", async () => {
      db.$client.exec("update accounts set overflow_account_id = 2 where id = 3");

      const state = await commit([savingsDraft(A_ID)]);

      expect(state.status).toBe("blocked");
      expect(state.issues).toEqual([{ index: null, message: "overflowChainCycle" }]);
    });
  });
});
