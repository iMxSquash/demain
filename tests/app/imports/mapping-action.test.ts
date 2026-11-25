import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { readMappingAction } from "../../../src/app/imports/actions";
import { createAccount } from "../../../src/ledger/accounts";
import { listImportBatches } from "../../../src/ledger/imports";
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
  getTimeZone: async () => "UTC",
  getTranslations: async () => (key: string) => key,
}));
vi.mock("../../../src/app/auth/session", () => ({ requireSession: async () => undefined }));
vi.mock("../../../src/app/translator", () => ({ getTranslator: async () => translateKey }));
vi.mock("../../../src/app/data-cache", () => ({ refreshData: () => undefined }));
vi.mock("../../../src/app/feedback/flash", () => ({
  flashSuccess: async () => undefined,
  flashError: async () => undefined,
}));
vi.mock("../../../src/storage/with-database", () => ({
  withDatabase: <T>(work: (db: AppDatabase) => T): T => work(holder.db as AppDatabase),
}));

// Synthetic: no header, so the columns cannot be found.
const HEADERLESS = "02/03/2026;SHOP;-12,50\n05/03/2026;SALARY;1500,00";

function mappingForm(fields: Record<string, string> = {}): FormData {
  const form = new FormData();
  form.set("accountId", "1");
  form.set("file", new File([HEADERLESS], "2026-03.csv"));
  for (const [name, value] of Object.entries(fields)) form.set(name, value);
  return form;
}

describe("readMappingAction", () => {
  let dataDir: string;
  let db: AppDatabase;

  beforeEach(() => {
    dataDir = mkdtempSync(path.join(tmpdir(), "demain-test-"));
    db = openDatabase(dataDir);
    migrateDatabase(db);
    holder.db = db;
    createAccount(db, {
      name: "Checking",
      kind: "checking",
      currency: "EUR",
      openingDate: "2026-01-01",
      openingBalance: 0,
    });
  });

  afterEach(() => {
    db.$client.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("gives the first rows and the mapping fields of a CSV whose columns are not found", async () => {
    const state = await readMappingAction(null, mappingForm());

    expect(state).toMatchObject({
      status: "mapping",
      message: "mappingNeeded",
      accountId: "1",
      rawRows: [
        ["02/03/2026", "SHOP", "-12,50"],
        ["05/03/2026", "SALARY", "1500,00"],
      ],
    });
    expect(state.mapping).toMatchObject({ delimiter: ";" });
  });

  it("records nothing, even with a mapping and a request to import (ADR-016)", async () => {
    await readMappingAction(
      null,
      mappingForm({
        intent: "import",
        mappingPresent: "1",
        delimiter: ";",
        dateColumn: "1",
        dateFormat: "dmy",
        labelColumn: "2",
        amountKind: "single",
        amountColumn: "3",
      }),
    );

    expect(listImportBatches(db, 1)).toEqual([]);
    expect(listTransactions(db)).toEqual([]);
  });
});
