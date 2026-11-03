import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AccountValidationError } from "../../src/domain/account";
import type { PendingOverflow } from "../../src/domain/import-overflow";
import {
  detailsFromSign,
  type ReviewedDraft,
  type RowDetails,
} from "../../src/domain/import-draft";
import {
  createAccount,
  getAccount,
  getAccountBalance,
  listAccounts,
  updateAccount,
} from "../../src/ledger/accounts";
import { listImportBatches } from "../../src/ledger/imports";
import { commitDrafts } from "../../src/ledger/staged-import";
import { getMonthlySynthesis } from "../../src/ledger/synthesis";
import { createTransaction, listTransactions } from "../../src/ledger/transactions";
import {
  type AppDatabase,
  migrateDatabase,
  openDatabase,
} from "../../src/storage/database";

const NOW = new Date("2026-03-01T10:00:00Z");

function draft(overrides: Partial<ReviewedDraft> = {}): ReviewedDraft {
  return {
    date: "2026-02-01",
    label: "CARD SHOP",
    amount: "-12,50",
    externalId: null,
    ...overrides,
  };
}

describe("commitDrafts", () => {
  let dataDir: string;
  let db: AppDatabase;
  let accountId: number;

  beforeEach(() => {
    dataDir = mkdtempSync(path.join(tmpdir(), "demain-test-"));
    db = openDatabase(dataDir);
    migrateDatabase(db);
    accountId = createAccount(db, {
      name: "Checking",
      kind: "checking",
      currency: "EUR",
      openingDate: "2026-01-01",
      openingBalance: 0,
    }).id;
  });

  afterEach(() => {
    db.$client.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  function commit(drafts: ReviewedDraft[], fileName = "2026-02.csv") {
    return commitDrafts(db, {
      accountId,
      format: "csv",
      fileName,
      mapping: null,
      drafts,
      now: NOW,
    });
  }

  it("records the edited rows as one batch named after the file", () => {
    const result = commit([
      draft(),
      draft({ date: "2026-02-05", label: "SALARY", amount: "1 143,88 €" }),
    ]);

    expect(result).toMatchObject({
      status: "done",
      newCount: 2,
      duplicateCount: 0,
    });
    expect(
      listTransactions(db).map((t) => [t.date, t.label, t.amount]),
    ).toEqual([
      ["2026-02-01", "CARD SHOP", -1_250],
      ["2026-02-05", "SALARY", 114_388],
    ]);
    expect(listImportBatches(db, accountId).map((b) => b.fileName)).toEqual([
      "2026-02.csv",
    ]);
  });

  it("records nothing and names every row that is still wrong", () => {
    const result = commit([
      draft(),
      draft({ date: "" }),
      draft({ label: " " }),
      draft({ amount: "0" }),
    ]);

    expect(result).toEqual({
      status: "invalid",
      problems: [
        { index: 1, problem: "dateInvalid" },
        { index: 2, problem: "labelRequired" },
        { index: 3, problem: "amountZero" },
      ],
    });
    expect(listTransactions(db)).toEqual([]);
    expect(listImportBatches(db, accountId)).toEqual([]);
  });

  describe("an explicit type against the sign of the amount", () => {
    const expense: RowDetails = { ...detailsFromSign(-1), type: "expense" };
    const against = (amount: string) =>
      draft({ label: "RENT", amount, details: expense });

    it("records the sign of the type and recognizes the same file the second time", () => {
      const first = commit([against("+50,00")]);
      const second = commit([against("+50,00")], "again.csv");

      expect(first).toMatchObject({ status: "done", newCount: 1 });
      expect(second).toMatchObject({ status: "done", newCount: 0, duplicateCount: 1 });
      expect(listTransactions(db).map((t) => t.amount)).toEqual([-5_000]);
    });

    it("recognizes the amount the review already signed as the same movement", () => {
      commit([against("+50,00")]);

      const second = commit([against("-50,00")], "again.csv");

      expect(second).toMatchObject({ status: "done", newCount: 0, duplicateCount: 1 });
      expect(listTransactions(db)).toHaveLength(1);
    });
  });

  it("ignores the rows already in the account, as an import does", () => {
    commit([draft()]);

    const second = commit(
      [draft(), draft({ label: "BAKERY", amount: "-3,20" })],
      "again.csv",
    );

    expect(second).toMatchObject({
      status: "done",
      newCount: 1,
      duplicateCount: 1,
    });
    expect(listTransactions(db)).toHaveLength(2);
  });

  it("records no batch when every row is already there", () => {
    commit([draft()]);

    const second = commit([draft()], "again.csv");

    expect(second).toMatchObject({
      status: "done",
      newCount: 0,
      batchId: null,
    });
    expect(listImportBatches(db, accountId)).toHaveLength(1);
  });
});

describe("commitDrafts with the details of a review", () => {
  const CHECKING_ID = 1;
  const A_ID = 2;
  const B_ID = 3;
  const ACCOUNT = { currency: "EUR", openingDate: "2026-01-01" };

  let dataDir: string;
  let db: AppDatabase;

  beforeEach(() => {
    dataDir = mkdtempSync(path.join(tmpdir(), "demain-test-"));
    db = openDatabase(dataDir);
    migrateDatabase(db);
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

  function savings(overrides: Partial<ReviewedDraft> = {}, details: Partial<RowDetails> = {}) {
    return draft({
      date: "2026-03-10",
      label: "VIR LIVRET",
      amount: "-300,00",
      details: {
        ...detailsFromSign(-1),
        type: "savings",
        savingsAccountId: A_ID,
        ...details,
      },
      ...overrides,
    }) as ReviewedDraft;
  }

  function commit(drafts: ReviewedDraft[]) {
    return commitDrafts(db, {
      accountId: CHECKING_ID,
      format: "csv",
      fileName: "2026-03.csv",
      mapping: null,
      drafts,
      now: NOW,
    });
  }

  it("records a savings row as transfers and counts them", () => {
    const result = commit([savings()]);

    expect(result).toMatchObject({ status: "done", newCount: 1, transferCount: 2 });
    expect([
      getAccountBalance(db, CHECKING_ID),
      getAccountBalance(db, A_ID),
      getAccountBalance(db, B_ID),
    ]).toEqual([70_000, 100_000, 20_000]);
  });

  it("still records a draft with no details by the sign of its amount", () => {
    const result = commit([draft({ date: "2026-03-02" })]);

    expect(result).toMatchObject({ status: "done", newCount: 1, transferCount: 0 });
    expect(listTransactions(db).map((t) => t.kind)).toEqual(["expense"]);
  });

  it("names the rows that have no savings account or cannot be read, and records nothing", () => {
    const result = commit([
      savings(),
      savings({}, { savingsAccountId: null }),
      draft({ date: "" }),
    ]);

    expect(result).toEqual({
      status: "invalid",
      problems: [
        { index: 1, problem: "savingsAccountRequired" },
        { index: 2, problem: "dateInvalid" },
      ],
    });
    expect(listTransactions(db)).toEqual([]);
  });

  it("records an expense typed on a positive amount as an outgoing one, without blocking", () => {
    const result = commit([
      draft({ date: "2026-03-02", amount: "50,00", details: detailsFromSign(-1) }),
    ]);

    expect(result).toMatchObject({ status: "done", newCount: 1 });
    expect(listTransactions(db).map((t) => [t.kind, t.amount])).toEqual([["expense", -5_000]]);
  });

  it("uses the savings account of the request for a row that names none", () => {
    const result = commitDrafts(db, {
      accountId: CHECKING_ID,
      format: "csv",
      fileName: "2026-03.csv",
      mapping: null,
      savingsAccountId: A_ID,
      drafts: [savings({}, { savingsAccountId: null })],
      now: NOW,
    });

    expect(result).toMatchObject({ status: "done", transferCount: 2 });
  });

  it("is blocked, and writes nothing, when part of a deposit fits nowhere", () => {
    updateAccount(db, A_ID, {
      ...ACCOUNT,
      name: "A",
      kind: "savings",
      openingBalance: 90_000,
      depositCeiling: 100_000,
      overflowAccountId: null,
    });

    const result = commit([draft({ date: "2026-03-02" }), savings()]);

    expect(result).toEqual({
      status: "blocked",
      issues: [{ kind: "savingsUnplaced", index: 1, amount: 20_000 }],
    });
    expect(listTransactions(db)).toEqual([]);
    expect(listImportBatches(db, CHECKING_ID)).toEqual([]);
  });

  describe("with an overflow account chosen in the review", () => {
    const OPENING_DATE = "2026-03-01";

    beforeEach(() => {
      updateAccount(db, A_ID, {
        ...ACCOUNT,
        name: "A",
        kind: "savings",
        openingBalance: 90_000,
        depositCeiling: 100_000,
        overflowAccountId: null,
      });
    });

    const chooseB = { accountId: A_ID, target: { kind: "existing", id: B_ID } } as const;

    function commitWith(
      choices: readonly PendingOverflow[],
      drafts: ReviewedDraft[] = [savings()],
    ) {
      return commitDrafts(db, {
        accountId: CHECKING_ID,
        format: "csv",
        fileName: "2026-03.csv",
        mapping: null,
        drafts,
        now: NOW,
        overflow: { choices, openingDate: OPENING_DATE },
      });
    }

    const accountNames = () => listAccounts(db, { includeArchived: true }).map(({ name }) => name);

    it("saves the link and the import together", () => {
      const result = commitWith([chooseB]);

      expect(result).toMatchObject({ status: "done", transferCount: 2 });
      expect(getAccount(db, A_ID).overflowAccountId).toBe(B_ID);
      expect(getAccountBalance(db, B_ID)).toBe(20_000);
    });

    it("creates the new account only with the import, then links it", () => {
      const result = commitWith([{ accountId: A_ID, target: { kind: "new", name: "Spare" } }]);

      expect(result).toMatchObject({ status: "done" });
      const spare = listAccounts(db).find(({ name }) => name === "Spare");
      expect(spare).toMatchObject({ kind: "savings", currency: "EUR", openingDate: OPENING_DATE });
      expect(getAccount(db, A_ID).overflowAccountId).toBe(spare?.id);
      expect(getAccountBalance(db, spare?.id ?? 0)).toBe(20_000);
    });

    it("applies the same choice again for a second file without creating a second account", () => {
      const choice = { accountId: A_ID, target: { kind: "new", name: "Spare" } } as const;
      commitWith([choice]);

      const second = commitWith([choice], [savings({ date: "2026-03-12", label: "VIR LIVRET 2" })]);

      expect(second).toMatchObject({ status: "done" });
      expect(accountNames().filter((name) => name === "Spare")).toHaveLength(1);
    });

    it("writes neither the link nor the new account when a row is still invalid", () => {
      const result = commitWith(
        [chooseB, { accountId: B_ID, target: { kind: "new", name: "Spare" } }],
        [savings(), draft({ date: "2026-13-45" })],
      );

      expect(result.status).toBe("invalid");
      expect(getAccount(db, A_ID).overflowAccountId).toBeNull();
      expect(accountNames()).not.toContain("Spare");
    });

    it("writes neither the link nor the new account when the ledger blocks the file", () => {
      const result = commitWith(
        [{ accountId: A_ID, target: { kind: "new", name: "Spare" } }],
        [savings(), savings({ label: "BAD" }, { categoryId: 999, type: "expense", savingsAccountId: null })],
      );

      expect(result.status).toBe("blocked");
      expect(getAccount(db, A_ID).overflowAccountId).toBeNull();
      expect(accountNames()).not.toContain("Spare");
      expect(listTransactions(db)).toEqual([]);
    });

    const refusal = (action: () => unknown): AccountValidationError => {
      try {
        action();
      } catch (error) {
        if (error instanceof AccountValidationError) return error;
        throw error;
      }
      throw new Error("Expected a refusal");
    };

    it.each([
      ["loops back to the account", "update accounts set overflow_account_id = 2 where id = 3", "overflowChainLoop"],
      ["is archived", "update accounts set archived = 1 where id = 3", "overflowAccountArchived"],
      ["has another currency", "update accounts set currency = 'USD' where id = 3", "overflowAccountCurrencyMismatch"],
    ])("refuses the whole import, and writes nothing, when the account chosen %s", (_name, statement, key) => {
      db.$client.exec(statement);

      expect(refusal(() => commitWith([chooseB])).ref.key).toBe(key);

      expect(getAccount(db, A_ID).overflowAccountId).toBeNull();
      expect(listTransactions(db)).toEqual([]);
      expect(listImportBatches(db, CHECKING_ID)).toEqual([]);
    });

    it("refuses the whole import when the new account has no name, and writes nothing", () => {
      expect(
        refusal(() => commitWith([{ accountId: A_ID, target: { kind: "new", name: " " } }])).ref.key,
      ).toBe("accountNameRequired");

      expect(listTransactions(db)).toEqual([]);
    });

    it("refuses to replace an overflow account defined since the review", () => {
      updateAccount(db, A_ID, {
        ...ACCOUNT,
        name: "A",
        kind: "savings",
        openingBalance: 90_000,
        depositCeiling: 100_000,
        overflowAccountId: B_ID,
      });
      const other = createAccount(db, { ...ACCOUNT, name: "Other", kind: "savings", openingBalance: 0 });

      const error = refusal(() =>
        commitWith([{ accountId: A_ID, target: { kind: "existing", id: other.id } }]),
      );

      expect(error.ref.key).toBe("importOverflowAlreadySet");
      expect(getAccount(db, A_ID).overflowAccountId).toBe(B_ID);
    });

    it("refuses the account that receives the file", () => {
      expect(
        refusal(() => commitWith([{ accountId: A_ID, target: { kind: "existing", id: CHECKING_ID } }])).ref.key,
      ).toBe("importOverflowIsReceiving");
    });
  });

  it("is blocked when the stored chain loops", () => {
    db.$client.exec("update accounts set overflow_account_id = 2 where id = 3");

    expect(commit([savings()])).toEqual({
      status: "blocked",
      issues: [{ kind: "overflowChainCycle" }],
    });
  });

  it.each([
    ["archived", "update accounts set archived = 1 where id = 2", "importSavingsAccountArchived"],
    ["not savings", "update accounts set kind = 'other' where id = 2", "importSavingsAccountNotSavings"],
  ])(
    "is blocked, and writes nothing, when the savings account is %s",
    (_name, statement, key) => {
      db.$client.exec(statement);

      expect(commit([savings()])).toEqual({
        status: "blocked",
        issues: [{ kind: "rowInvalid", index: 0, ref: { key } }],
      });
      expect(listTransactions(db)).toEqual([]);
    },
  );

  it("imports onto an account that already holds transactions", () => {
    createTransaction(db, {
      accountId: CHECKING_ID,
      date: "2026-02-01",
      amount: -500,
      kind: "expense",
      label: "EARLIER",
    });

    expect(commit([savings()])).toMatchObject({ status: "done", transferCount: 2 });
  });

  it("counts a deposit minus a withdrawal as the savings of the month", () => {
    commit([savings(), savings({ date: "2026-03-20", label: "RETRAIT", amount: "50,00" })]);

    const march = getMonthlySynthesis(db, {
      referenceCurrency: "EUR",
      throughMonth: "2026-03",
    }).find((row) => row.month === "2026-03");
    expect(march?.savings).toBe(25_000);
  });
});
