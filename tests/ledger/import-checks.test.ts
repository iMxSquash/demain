import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { archiveAccount, createAccount } from "../../src/ledger/accounts";
import {
  BalanceAssertionOnArchivedAccountError,
  listBalanceAssertions,
  saveBalanceAssertion,
} from "../../src/ledger/balance-assertions";
import { commitImport } from "../../src/ledger/imports";
import {
  batchBalanceGap,
  getBatchBalanceCheck,
  ImportBatchNotFoundError,
  ImportBatchWithoutMovementError,
  listRuleProposals,
  recordBatchBalanceAssertion,
  saveRuleProposals,
} from "../../src/ledger/import-checks";
import { createCategory } from "../../src/ledger/categories";
import { createRule, listRules } from "../../src/ledger/categorization-rules";
import { createTransaction } from "../../src/ledger/transactions";
import {
  type AppDatabase,
  migrateDatabase,
  openDatabase,
} from "../../src/storage/database";
import { balanceAssertions, transactions } from "../../src/storage/schema";

const NOW = new Date("2026-04-15T10:00:00Z");
const OPENING_BALANCE = 10_000;

const ACCOUNT = {
  kind: "checking",
  currency: "EUR",
  openingDate: "2026-01-01",
  openingBalance: OPENING_BALANCE,
} as const;

function row(date: string, amount: number, label: string) {
  return { date, amount, label, externalId: null };
}

describe("import checks", () => {
  let dataDir: string;
  let db: AppDatabase;
  let accountId: number;

  beforeEach(() => {
    dataDir = mkdtempSync(path.join(tmpdir(), "demain-test-"));
    db = openDatabase(dataDir);
    migrateDatabase(db);
    accountId = createAccount(db, { ...ACCOUNT, name: "Checking" }).id;
  });

  afterEach(() => {
    db.$client.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  function importFile(rows: ReturnType<typeof row>[], onAccountId = accountId): number {
    const result = commitImport(db, {
      accountId: onAccountId,
      rows,
      format: "csv",
      fileName: "march.csv",
      mapping: null,
      now: NOW,
    });
    if (result.batchId === null) throw new Error("nothing was imported");
    return result.batchId;
  }

  it("ends the file on the latest date of its movements, not today", () => {
    const batchId = importFile([
      row("2026-03-10", -1_000, "A"),
      row("2026-03-31", -500, "B"),
      row("2026-03-02", -250, "C"),
    ]);

    expect(getBatchBalanceCheck(db, batchId).endDate).toBe("2026-03-31");
  });

  it("computes the balance on the end date from the opening balance and the account movements", () => {
    const batchId = importFile([row("2026-03-10", -1_000, "A"), row("2026-03-31", -500, "B")]);

    expect(getBatchBalanceCheck(db, batchId)).toMatchObject({
      batchId,
      accountId,
      currency: "EUR",
      computedBalance: OPENING_BALANCE - 1_500,
    });
  });

  it("counts a manual movement dated before the end date and ignores a later one", () => {
    const batchId = importFile([row("2026-03-31", -500, "B")]);
    createTransaction(db, { accountId, date: "2026-03-15", amount: 2_000, kind: "income", label: "Salary" });
    createTransaction(db, { accountId, date: "2026-04-02", amount: -9_999, kind: "expense", label: "Later" });

    expect(getBatchBalanceCheck(db, batchId).computedBalance).toBe(OPENING_BALANCE + 2_000 - 500);
  });

  it("ignores the movements of other accounts", () => {
    const other = createAccount(db, { ...ACCOUNT, name: "Other", openingBalance: 777 }).id;
    createTransaction(db, { accountId: other, date: "2026-06-01", amount: 5_000, kind: "income", label: "Elsewhere" });
    const batchId = importFile([row("2026-03-31", -500, "B")]);

    const check = getBatchBalanceCheck(db, batchId);

    expect(check.endDate).toBe("2026-03-31");
    expect(check.computedBalance).toBe(OPENING_BALANCE - 500);
  });

  it("refuses an unknown batch", () => {
    expect(() => getBatchBalanceCheck(db, 999)).toThrow(ImportBatchNotFoundError);
  });

  it("refuses a batch whose movements are all gone", () => {
    const batchId = importFile([row("2026-03-31", -500, "B")]);
    db.delete(transactions).run();

    expect(() => getBatchBalanceCheck(db, batchId)).toThrow(ImportBatchWithoutMovementError);
  });

  describe("batchBalanceGap", () => {
    const check = {
      batchId: 1,
      accountId: 1,
      currency: "EUR",
      endDate: "2026-03-31",
      computedBalance: 50_000,
    };

    it("is zero when the real balance equals the computed balance", () => {
      expect(batchBalanceGap(check, 50_000)).toBe(0);
    });

    it("is positive when Demain holds more than the bank", () => {
      expect(batchBalanceGap(check, 46_544)).toBe(3_456);
    });

    it("is negative when Demain holds less than the bank", () => {
      expect(batchBalanceGap(check, 53_456)).toBe(-3_456);
    });
  });

  describe("recordBatchBalanceAssertion", () => {
    const TYPED_BALANCE = 114_388;

    function assertionRows() {
      return db.select().from(balanceAssertions).all();
    }

    it("dates the assertion on the end date of the file, not today", () => {
      const batchId = importFile([row("2026-03-10", -1_000, "A"), row("2026-03-31", -500, "B")]);

      const saved = recordBatchBalanceAssertion(db, batchId, TYPED_BALANCE);

      expect(saved.date).toBe("2026-03-31");
      expect(saved.accountId).toBe(accountId);
    });

    it("stores the typed amount in minor units, without a note", () => {
      const batchId = importFile([row("2026-03-31", -500, "B")]);

      recordBatchBalanceAssertion(db, batchId, TYPED_BALANCE);

      expect(assertionRows()).toMatchObject([{ amount: 114_388, note: null }]);
    });

    it("replaces an assertion of the same day instead of adding one", () => {
      const batchId = importFile([row("2026-03-31", -500, "B")]);
      saveBalanceAssertion(db, { accountId, date: "2026-03-31", amount: 1, note: "old" });

      recordBatchBalanceAssertion(db, batchId, TYPED_BALANCE);

      expect(assertionRows()).toMatchObject([{ amount: 114_388, note: null }]);
    });

    it("refuses an archived account and writes nothing", () => {
      const batchId = importFile([row("2026-03-31", -500, "B")]);
      createTransaction(db, { accountId, date: "2026-04-01", amount: -9_500, kind: "expense", label: "Empty" });
      archiveAccount(db, accountId);

      expect(() => recordBatchBalanceAssertion(db, batchId, TYPED_BALANCE)).toThrow(
        BalanceAssertionOnArchivedAccountError,
      );
      expect(assertionRows()).toHaveLength(0);
    });

    it("leaves no gap when the recorded balance is the computed one", () => {
      const batchId = importFile([row("2026-03-31", -500, "B")]);
      const { computedBalance } = getBatchBalanceCheck(db, batchId);

      recordBatchBalanceAssertion(db, batchId, computedBalance);

      expect(batchBalanceGap(getBatchBalanceCheck(db, batchId), computedBalance)).toBe(0);
      expect(listBalanceAssertions(db, accountId)[0]?.gap).toBe(0);
    });

    it("refuses an unknown batch and writes nothing", () => {
      expect(() => recordBatchBalanceAssertion(db, 999, TYPED_BALANCE)).toThrow(
        ImportBatchNotFoundError,
      );
      expect(assertionRows()).toHaveLength(0);
    });
  });

  describe("rule proposals", () => {
    let groceries: number;
    let leisure: number;

    beforeEach(() => {
      groceries = createCategory(db, { name: "Groceries" }).id;
      leisure = createCategory(db, { name: "Leisure" }).id;
    });

    function categorize(batchId: number, label: string, categoryId: number, kind?: "transfer") {
      db.update(transactions)
        .set({ categoryId, ...(kind === undefined ? {} : { kind }) })
        .where(and(eq(transactions.importBatchId, batchId), eq(transactions.label, label)))
        .run();
    }

    function proposalBatch(): number {
      const batchId = importFile([
        row("2026-03-02", -100, "Card Shop"),
        row("2026-03-09", -200, "CARD SHOP"),
        row("2026-03-10", -300, "Cinema"),
        row("2026-03-11", -400, "Moving"),
        row("2026-03-12", -500, "Unknown"),
      ]);
      categorize(batchId, "Card Shop", groceries);
      categorize(batchId, "CARD SHOP", groceries);
      categorize(batchId, "Cinema", leisure);
      categorize(batchId, "Moving", groceries, "transfer");
      return batchId;
    }

    it("proposes a pair shared by two rows of the batch once", () => {
      const proposals = listRuleProposals(db, proposalBatch());

      expect(proposals.filter(({ label }) => label === "card shop")).toHaveLength(1);
    });

    it("does not propose a pair already covered by an applicable rule", () => {
      createRule(db, { operator: "contains", value: "shop", categoryId: groceries });

      const labels = listRuleProposals(db, proposalBatch()).map(({ label }) => label);

      expect(labels).toEqual(["cinema"]);
    });

    it("proposes the same label with another category than the existing rule", () => {
      createRule(db, { operator: "equals", value: "cinema", categoryId: groceries });

      const proposals = listRuleProposals(db, proposalBatch());

      expect(proposals).toContainEqual(expect.objectContaining({ label: "cinema", categoryId: leisure }));
    });

    it("ignores transfer rows and rows without a category", () => {
      const labels = listRuleProposals(db, proposalBatch()).map(({ label }) => label);

      expect(labels).not.toContain("moving");
      expect(labels).not.toContain("unknown");
    });

    it("names the category of each proposal", () => {
      const proposals = listRuleProposals(db, proposalBatch());

      expect(proposals.find(({ label }) => label === "cinema")?.categoryName).toBe("Leisure");
    });

    it("creates no rule when the selection is empty", () => {
      const batchId = proposalBatch();

      const result = saveRuleProposals(db, batchId, []);

      expect(result.created).toBe(0);
      expect(listRules(db)).toHaveLength(0);
    });

    it("creates one equals rule scoped to the account for a selected proposal", () => {
      const batchId = proposalBatch();
      const cinema = listRuleProposals(db, batchId).find(({ label }) => label === "cinema");
      if (cinema === undefined) throw new Error("no proposal for cinema");

      const result = saveRuleProposals(db, batchId, [cinema.key]);

      expect(result.created).toBe(1);
      expect(listRules(db)).toMatchObject([
        { operator: "equals", value: "cinema", categoryId: leisure, accountId },
      ]);
    });

    it("creates no rule at all when one of the selected rules cannot be created", () => {
      const batchId = proposalBatch();
      const keys = listRuleProposals(db, batchId).map(({ key }) => key);
      expect(keys).toHaveLength(2);
      // Fails on the second proposal, after the first rule was inserted.
      db.$client.exec(
        `CREATE TRIGGER fail_cinema_rule BEFORE INSERT ON categorization_rules
         WHEN NEW.value = 'cinema' BEGIN SELECT RAISE(ABORT, 'insert refused'); END`,
      );

      expect(() => saveRuleProposals(db, batchId, keys)).toThrow("insert refused");

      expect(listRules(db)).toHaveLength(0);
    });

    it("creates no rule for a selection that is not derived from the batch", () => {
      const batchId = proposalBatch();

      const result = saveRuleProposals(db, batchId, ["999:not-a-label"]);

      expect(result.created).toBe(0);
      expect(listRules(db)).toHaveLength(0);
    });

    it("creates a rule once when the same key is selected twice", () => {
      const batchId = proposalBatch();
      const cinema = listRuleProposals(db, batchId).find(({ label }) => label === "cinema");
      if (cinema === undefined) throw new Error("no proposal for cinema");

      saveRuleProposals(db, batchId, [cinema.key, cinema.key]);

      expect(listRules(db)).toHaveLength(1);
    });

    it("no longer proposes a pair that has just been saved", () => {
      const batchId = proposalBatch();
      const cinema = listRuleProposals(db, batchId).find(({ label }) => label === "cinema");
      if (cinema === undefined) throw new Error("no proposal for cinema");

      saveRuleProposals(db, batchId, [cinema.key]);

      expect(listRuleProposals(db, batchId).map(({ label }) => label)).not.toContain("cinema");
    });

    it("refuses an unknown batch", () => {
      expect(() => listRuleProposals(db, 999)).toThrow(ImportBatchNotFoundError);
      expect(() => saveRuleProposals(db, 999, [])).toThrow(ImportBatchNotFoundError);
    });
  });
});
