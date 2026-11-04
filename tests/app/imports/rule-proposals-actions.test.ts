import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  listRuleProposalsAction,
  saveRuleProposalsAction,
} from "../../../src/app/imports/checks-actions";
import { createAccount } from "../../../src/ledger/accounts";
import { createCategory } from "../../../src/ledger/categories";
import { listRules } from "../../../src/ledger/categorization-rules";
import { commitImport } from "../../../src/ledger/imports";
import {
  type AppDatabase,
  migrateDatabase,
  openDatabase,
} from "../../../src/storage/database";
import { transactions } from "../../../src/storage/schema";
import { translateKey } from "../translate-key";

const holder = vi.hoisted(() => ({ db: null as unknown }));

vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
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

describe("rule proposal actions", () => {
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
      openingBalance: 0,
    }).id;
    const categoryId = createCategory(db, { name: "Leisure" }).id;
    const result = commitImport(db, {
      accountId,
      rows: [{ date: "2026-03-02", amount: -1_250, label: "Cinema", externalId: null }],
      format: "csv",
      fileName: "march.csv",
      mapping: null,
      now: new Date("2026-04-15T10:00:00Z"),
    });
    if (result.batchId === null) throw new Error("nothing was imported");
    batchId = result.batchId;
    db.update(transactions).set({ categoryId }).where(eq(transactions.importBatchId, batchId)).run();
  });

  afterEach(() => {
    db.$client.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("lists the proposals of the batch with the category name", async () => {
    const state = await listRuleProposalsAction(batchId);

    expect(state).toMatchObject({
      status: "ready",
      proposals: [{ label: "cinema", categoryName: "Leisure" }],
      hasCategorizedRow: true,
    });
  });

  it("tells when the file has no categorized row at all", async () => {
    db.update(transactions).set({ categoryId: null }).where(eq(transactions.importBatchId, batchId)).run();

    expect(await listRuleProposalsAction(batchId)).toEqual({
      status: "ready",
      proposals: [],
      hasCategorizedRow: false,
    });
  });

  it("creates the selected rule and says how many were created", async () => {
    const state = await listRuleProposalsAction(batchId);
    if (state.status !== "ready") throw new Error("no proposals");

    const saved = await saveRuleProposalsAction(batchId, state.proposals.map(({ key }) => key));

    expect(saved.status).toBe("saved");
    expect(saved.message).toContain('"count":1');
    expect(listRules(db)).toHaveLength(1);
  });

  it("creates nothing and says so when nothing is selected", async () => {
    const saved = await saveRuleProposalsAction(batchId, []);

    expect(saved).toEqual({ status: "error", message: "noneSelected" });
    expect(listRules(db)).toHaveLength(0);
  });

  it("creates nothing for a selection that is not derived from the batch", async () => {
    const saved = await saveRuleProposalsAction(batchId, ["1:forged"]);

    expect(saved.status).toBe("error");
    expect(listRules(db)).toHaveLength(0);
  });

  it("refuses an unknown batch", async () => {
    expect(await listRuleProposalsAction(999)).toEqual({
      status: "error",
      message: "importBatchGone",
    });
    expect(await saveRuleProposalsAction(999, ["1:cinema"])).toEqual({
      status: "error",
      message: "importBatchGone",
    });
  });
});
