import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  commitStagedFileAction,
  stageFileAction,
} from "../../../src/app/imports/stage-actions";
import type { CommitStagedRequest } from "../../../src/app/imports/commit-request";
import {
  createAccount,
  getAccount,
  getAccountBalance,
  listAccounts,
  updateAccount,
} from "../../../src/ledger/accounts";
import { createCategory } from "../../../src/ledger/categories";
import { commitImport, listImportBatches } from "../../../src/ledger/imports";
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

  it("carries the id of the batch the file was recorded in", async () => {
    const state = await commit([draft()]);

    const batches = listImportBatches(db, CHECKING_ID);
    expect(state.status).toBe("done");
    expect(batches).toHaveLength(1);
    expect(state.batchId).toBe(batches[0]?.id);
  });

  it("carries the end date of the file with the batch id", async () => {
    const state = await commit([draft()]);

    expect(state.batchId).not.toBeNull();
    expect(state.endDate).toBe(listTransactions(db)[0]?.date);
  });

  it("carries no end date when no batch was recorded", async () => {
    await commit([draft()]);

    const again = await commit([draft()]);
    const refused = await commit([draft({ amount: "abc" })]);

    expect(again.endDate).toBeNull();
    expect(refused.endDate).toBeNull();
  });

  it("carries no batch id when every row was already in the account", async () => {
    await commit([draft()]);

    const state = await commit([draft()]);

    expect(state.status).toBe("done");
    expect(state.batchId).toBeNull();
  });

  it("carries no batch id when the file is refused", async () => {
    const state = await commit([draft({ amount: "abc" })]);

    expect(state.status).toBe("invalid");
    expect(state.batchId).toBeNull();
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
      draft({ date: "", details: EXPENSE_DETAILS }),
    ]);

    expect(state).toMatchObject({
      status: "invalid",
      problems: [{ index: 1, problem: "dateInvalid" }],
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
      expect(state.issues).toEqual([{ message: "overflowChainCycle" }]);
    });
  });
});

describe("commitStagedFileAction with an overflow account chosen in the review", () => {
  let dataDir: string;
  let db: AppDatabase;

  beforeEach(() => {
    dataDir = mkdtempSync(path.join(tmpdir(), "demain-test-"));
    db = openDatabase(dataDir);
    migrateDatabase(db);
    holder.db = db;
    createAccount(db, { ...ACCOUNT, name: "Checking", kind: "checking", openingBalance: 100_000 });
    createAccount(db, {
      ...ACCOUNT,
      name: "A",
      kind: "savings",
      openingBalance: 90_000,
      depositCeiling: 100_000,
    });
    createAccount(db, { ...ACCOUNT, name: "B", kind: "savings", openingBalance: 0 });
  });

  afterEach(() => {
    db.$client.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  function commit(overflowChoices: unknown[]) {
    return commitStagedFileAction({
      accountId: CHECKING_ID,
      fileName: "2026-03.csv",
      format: "csv",
      mapping: null,
      drafts: [savingsDraft(A_ID)],
      overflowChoices,
    } as CommitStagedRequest);
  }

  const accountNames = () => listAccounts(db, { includeArchived: true }).map(({ name }) => name);

  it("saves the link with the import", async () => {
    const state = await commit([{ accountId: A_ID, target: { kind: "existing", id: B_ID } }]);

    expect(state.status).toBe("done");
    expect(getAccount(db, A_ID).overflowAccountId).toBe(B_ID);
    expect(listTransactions(db)).toHaveLength(4);
  });

  it("creates the new account only when the file is imported", async () => {
    expect(accountNames()).not.toContain("Spare");

    const state = await commit([{ accountId: A_ID, target: { kind: "new", name: "Spare" } }]);

    expect(state.status).toBe("done");
    expect(accountNames()).toContain("Spare");
  });

  it("refuses the whole import with a message when the account chosen would loop", async () => {
    db.$client.exec("update accounts set overflow_account_id = 2 where id = 3");

    const state = await commit([{ accountId: A_ID, target: { kind: "existing", id: B_ID } }]);

    expect(state).toMatchObject({ status: "error", message: "overflowChainLoop" });
    expect(getAccount(db, A_ID).overflowAccountId).toBeNull();
    expect(listTransactions(db)).toEqual([]);
  });

  it("refuses the whole import with a message when the account chosen is archived", async () => {
    db.$client.exec("update accounts set archived = 1 where id = 3");

    const state = await commit([{ accountId: A_ID, target: { kind: "existing", id: B_ID } }]);

    expect(state).toMatchObject({ status: "error", message: "overflowAccountArchived" });
    expect(getAccount(db, A_ID).overflowAccountId).toBeNull();
  });

  it("refuses a choice shaped otherwise, and records nothing", async () => {
    const state = await commit([{ accountId: A_ID, target: { kind: "existing", id: B_ID }, extra: 1 }]);

    expect(state.status).toBe("error");
    expect(listTransactions(db)).toEqual([]);
  });
});

describe("stageFileAction", () => {
  let dataDir: string;
  let db: AppDatabase;

  const TYPED_CSV = [
    "Date;Label;Amount;Type;Category",
    "10/03/2026;Livret;-300,00;Savings;",
    "02/03/2026;Carrefour;-12,50;Expense;GROCERIES",
    "05/03/2026;Salary ACME;1 500,00;Income;Salary",
  ].join("\n");

  const OFX = `OFXHEADER:100
DATA:OFXSGML
VERSION:102

<OFX>
<BANKMSGSRSV1>
<STMTTRNRS>
<STMTRS>
<CURDEF>EUR
<BANKTRANLIST>
<STMTTRN>
<DTPOSTED>20260201
<TRNAMT>-12.50
<FITID>A1
<NAME>CARD SHOP
</STMTTRN>
<STMTTRN>
<DTPOSTED>20260205
<TRNAMT>1143.88
<FITID>A2
<NAME>SALARY
</STMTTRN>
</BANKTRANLIST>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>`;

  beforeEach(() => {
    dataDir = mkdtempSync(path.join(tmpdir(), "demain-test-"));
    db = openDatabase(dataDir);
    migrateDatabase(db);
    holder.db = db;
    createAccount(db, { ...ACCOUNT, name: "Checking", kind: "checking", openingBalance: 0 });
  });

  afterEach(() => {
    db.$client.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  function stage(
    content: string,
    fileName = "2026-03.csv",
    accountId = CHECKING_ID,
    columns: Record<string, string> = {},
  ) {
    const form = new FormData();
    form.set("accountId", String(accountId));
    form.set("file", new File([content], fileName));
    for (const [name, value] of Object.entries(columns)) form.set(name, value);
    return stageFileAction(form);
  }

  it("reads the type, the category and the payment mode of every row, whatever the number of files", async () => {
    const groceries = createCategory(db, { name: "Groceries" });
    const salary = createCategory(db, { name: "Salary" });

    const file = await stage(TYPED_CSV);

    expect(file.status).toBe("ready");
    expect(
      file.rows.map((row) => [
        row.draft.label,
        row.draft.amount,
        row.details.type,
        row.details.categoryId,
        row.guess?.type,
      ]),
    ).toEqual([
      ["Livret", "-300.00", "savings", null, "savings"],
      ["Carrefour", "-12.50", "expense", groceries.id, "expense"],
      ["Salary ACME", "1500.00", "income", salary.id, "income"],
    ]);
  });

  describe("columns", () => {
    const NOTES_CSV = [
      "Date;Label;Amount;Notes;Rubrique",
      "02/03/2026;Carrefour;-12,50;weekly shop;GROCERIES",
      "05/03/2026;Salary ACME;1 500,00;payroll;Salary",
    ].join("\n");

    it("tells which column holds each role and which columns can take one", async () => {
      const file = await stage(NOTES_CSV);

      expect(file.columns).toEqual({
        roles: { typeColumn: null, paymentModeColumn: null, categoryColumn: 4, descriptionColumn: 3 },
        available: [
          { column: 3, header: "Notes" },
          { column: 4, header: "Rubrique" },
        ],
      });
    });

    it("reads the file again with the column the user assigned to a role", async () => {
      const groceries = createCategory(db, { name: "weekly shop" });

      const file = await stage(NOTES_CSV, "2026-03.csv", CHECKING_ID, {
        categoryColumn: "3",
        descriptionColumn: "4",
      });

      expect(file.columns?.roles).toMatchObject({ categoryColumn: 3, descriptionColumn: 4 });
      expect(file.rows.map((row) => row.details.categoryId)).toEqual([groceries.id, null]);
      expect(file.rows.map((row) => row.details.description)).toEqual(["GROCERIES", "Salary"]);
    });

    it("leaves a role empty when the user says the file has none", async () => {
      const file = await stage(NOTES_CSV, "2026-03.csv", CHECKING_ID, {
        categoryColumn: "none",
      });

      expect(file.columns?.roles.categoryColumn).toBeNull();
      expect(file.rows.map((row) => row.details.categoryId)).toEqual([null, null]);
    });

    it("has no columns to offer for an OFX statement", async () => {
      const file = await stage(OFX, "statement.ofx");

      expect(file.columns).toBeNull();
    });
  });

  it("gives the first date of the file, whatever the order of its rows", async () => {
    const file = await stage(TYPED_CSV);

    expect(file.firstDate).toBe("2026-03-02");
  });

  it("flags the rows the account already holds", async () => {
    commitImport(db, {
      accountId: CHECKING_ID,
      format: "csv",
      fileName: "earlier.csv",
      mapping: null,
      rows: [{ date: "2026-03-02", label: "Carrefour", amount: -1_250, externalId: null }],
      now: new Date("2026-03-20T10:00:00Z"),
    });

    const file = await stage(TYPED_CSV);

    expect(file.rows.map((row) => row.isDuplicate)).toEqual([false, true, false]);
  });

  it("keeps the mapping that read the file, for the batch", async () => {
    const file = await stage(TYPED_CSV);

    expect(file.mapping).toMatchObject({ delimiter: ";", dateColumn: 0, labelColumn: 1 });
  });

  it("types the rows of an OFX statement by the sign of their amount", async () => {
    const file = await stage(OFX, "statement.ofx");

    expect(file).toMatchObject({ status: "ready", format: "ofx", mapping: null, firstDate: "2026-02-01" });
    expect(file.rows.map((row) => [row.details.type, row.guess])).toEqual([
      ["expense", null],
      ["income", null],
    ]);
  });

  describe("when the columns cannot be found in the file", () => {
    const HEADERLESS = "02/03/2026;SHOP;-12,50\n05/03/2026;SALARY;1500,00";

    it("asks for the mapping to be set", async () => {
      const file = await stage(HEADERLESS);

      expect(file).toMatchObject({
        status: "failed",
        message: "staged.mappingNeeded",
        needsMapping: true,
      });
    });

    it("reads it with the mapping of the last import, typing the rows by their sign", async () => {
      commitImport(db, {
        accountId: CHECKING_ID,
        format: "csv",
        fileName: "earlier.csv",
        mapping: {
          delimiter: ";",
          hasHeader: false,
          dateColumn: 0,
          dateFormat: "dmy",
          labelColumn: 1,
          amount: { kind: "single", column: 2 },
        },
        rows: [{ date: "2026-01-02", label: "OLD", amount: -100, externalId: null }],
        now: new Date("2026-03-20T10:00:00Z"),
      });

      const file = await stage(HEADERLESS);

      expect(file.status).toBe("ready");
      expect(file.firstDate).toBe("2026-03-02");
      expect(file.rows.map((row) => [row.draft.label, row.details.type, row.guess])).toEqual([
        ["SHOP", "expense", null],
        ["SALARY", "income", null],
      ]);
    });
  });

  it("says when the dates have no year, instead of showing an empty file", async () => {
    const file = await stage("Date;Label;Amount\n02/03;SHOP;-12,50", "statement.csv");

    expect(file).toMatchObject({ status: "failed", message: "staged.yearMissing", needsMapping: false });
  });

  it("takes the year of the dates from the name of the file", async () => {
    const file = await stage("Date;Label;Amount\n02/03;SHOP;-12,50", "2026-03.csv");

    expect(file.status).toBe("ready");
    expect(file.rows[0]?.draft.date).toBe("2026-03-02");
  });

  it("refuses a file for an account that does not exist", async () => {
    const file = await stage(TYPED_CSV, "2026-03.csv", 99);

    expect(file).toMatchObject({ status: "failed", message: "accountGone" });
  });
});
