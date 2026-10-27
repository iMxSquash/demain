import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { SheetRow } from "../../src/domain/sheet-import";
import type { SummaryMonth } from "../../src/domain/sheet-summary";
import {
  createRule,
  listRules,
} from "../../src/ledger/categorization-rules";
import { listBalanceAssertions } from "../../src/ledger/balance-assertions";
import {
  archiveAccount,
  createAccount,
  getAccount,
  getAccountBalance,
} from "../../src/ledger/accounts";
import {
  archiveCategory,
  createCategory,
  listCategories,
} from "../../src/ledger/categories";
import {
  commitSheetMigration,
  previewSheetMigration,
  SheetMigrationBlockedError,
  type SheetMigrationRequest,
} from "../../src/ledger/sheet-migration";
import {
  createTransaction,
  listTransactions,
} from "../../src/ledger/transactions";
import {
  type AppDatabase,
  migrateDatabase,
  openDatabase,
} from "../../src/storage/database";

// Synthetic figures in minor units, never the owner's.
const row = (overrides: Partial<SheetRow> = {}): SheetRow => ({
  source: "january.csv",
  line: 2,
  date: "2026-01-05",
  label: "Carrefour",
  amount: 1_250,
  type: "expense",
  category: "Food",
  paymentMode: "card",
  ...overrides,
});

const summaryMonth = (
  month: string,
  overrides: Partial<SummaryMonth> = {},
): SummaryMonth => ({
  month,
  net: null,
  savings: null,
  cumulativeSavings: null,
  cumulativeAccount: null,
  savingsBalance: null,
  realAccountBalance: null,
  ...overrides,
});

describe("sheet migration", () => {
  let dataDir: string;
  let db: AppDatabase;
  let checkingId: number;
  let livretJeuneId: number;
  let livretAId: number;

  beforeEach(() => {
    dataDir = mkdtempSync(path.join(tmpdir(), "demain-test-"));
    db = openDatabase(dataDir);
    migrateDatabase(db);
    const account = (name: string, extra: object = {}) =>
      createAccount(db, {
        name,
        kind: name === "Checking" ? "checking" : "savings",
        currency: "EUR",
        openingDate: "2026-01-01",
        openingBalance: 0,
        ...extra,
      }).id;
    checkingId = account("Checking");
    livretAId = account("Livret A");
    livretJeuneId = account("Livret Jeune", {
      depositCeiling: 160_000,
      overflowAccountId: livretAId,
    });
  });

  afterEach(() => {
    db.$client.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  const request = (
    rows: SheetRow[],
    overrides: Partial<SheetMigrationRequest> = {},
  ): SheetMigrationRequest => ({
    rows,
    checkingId,
    savingsDestinationId: livretJeuneId,
    openingDate: "2025-12-31",
    openingBalances: [
      { accountId: checkingId, amount: 5_000 },
      { accountId: livretJeuneId, amount: 147_684 },
      { accountId: livretAId, amount: 0 },
    ],
    summary: [],
    ...overrides,
  });

  describe("commitSheetMigration", () => {
    it("records expenses and incomes with their category and payment mode, and sets the opening balances", () => {
      commitSheetMigration(
        db,
        request([
          row(),
          row({
            line: 3,
            date: "2026-01-10",
            label: "Salary",
            amount: 150_000,
            type: "income",
            category: "Pay",
            paymentMode: "transfer",
          }),
        ]),
      );

      expect(
        listTransactions(db).map((t) => [
          t.accountId,
          t.kind,
          t.amount,
          t.label,
          t.paymentMode,
        ]),
      ).toEqual([
        [checkingId, "expense", -1_250, "Carrefour", "card"],
        [checkingId, "income", 150_000, "Salary", "transfer"],
      ]);
      expect(listCategories(db).map((category) => category.name)).toEqual([
        "Food",
        "Pay",
      ]);
      expect(getAccount(db, checkingId)).toMatchObject({
        openingBalance: 5_000,
        openingDate: "2025-12-31",
      });
      expect(getAccount(db, livretJeuneId).openingBalance).toBe(147_684);
    });

    it("records a savings row as one transfer per account of the chain, linked in pairs", () => {
      commitSheetMigration(
        db,
        request([
          row({
            line: 2,
            date: "2026-01-31",
            label: "Savings",
            amount: 57_316,
            type: "savings",
            category: null,
            paymentMode: null,
          }),
        ]),
      );

      const recorded = listTransactions(db);
      expect(
        recorded.map((t) => [t.accountId, t.kind, t.amount, t.categoryId]),
      ).toEqual([
        [checkingId, "transfer", -12_316, null],
        [livretJeuneId, "transfer", 12_316, null],
        [checkingId, "transfer", -45_000, null],
        [livretAId, "transfer", 45_000, null],
      ]);
      for (const leg of recorded) {
        const counterpart = recorded.find(
          (t) => t.id === leg.transferCounterpartId,
        );
        expect(counterpart?.amount).toBe(-leg.amount);
      }
      expect(getAccountBalance(db, livretJeuneId)).toBe(160_000);
      expect(getAccountBalance(db, livretAId)).toBe(45_000);
      expect(getAccountBalance(db, checkingId)).toBe(5_000 - 57_316);
    });
  });

  const savingsRow = (overrides: Partial<SheetRow> = {}): SheetRow =>
    row({
      line: 3,
      date: "2026-01-31",
      label: "Savings",
      amount: 57_316,
      type: "savings",
      category: null,
      paymentMode: null,
      ...overrides,
    });

  describe("previewSheetMigration", () => {
    it("shows the split and the categories to create without writing anything", () => {
      const preview = previewSheetMigration(db, request([row(), savingsRow()]));

      expect(preview.splits[0]?.placements).toEqual([
        { accountId: livretJeuneId, amount: 12_316 },
        { accountId: livretAId, amount: 45_000 },
      ]);
      expect(preview.categoriesToCreate).toEqual(["Food"]);
      expect(preview.issues).toEqual([]);
      expect(listTransactions(db)).toEqual([]);
      expect(listCategories(db)).toEqual([]);
      expect(getAccount(db, checkingId).openingBalance).toBe(0);
    });
  });

  describe("a migration with a blocking issue", () => {
    it("is refused as a whole, and the issues are those of the preview", () => {
      db.$client
        .prepare("update accounts set deposit_ceiling = 10000 where id = ?")
        .run(livretAId);
      const blocked = request([row(), savingsRow()]);

      expect(() => commitSheetMigration(db, blocked)).toThrow(
        SheetMigrationBlockedError,
      );
      expect(previewSheetMigration(db, blocked).issues).toEqual([
        { kind: "savingsUnplaced", source: "january.csv", line: 3, amount: 35_000 },
      ]);
      expect(listTransactions(db)).toEqual([]);
      expect(getAccount(db, checkingId).openingBalance).toBe(0);
    });
  });

  describe("what the preview reports before anything is written", () => {
    it("refuses an account that already has transactions, so a second run cannot double the history", () => {
      createTransaction(db, {
        accountId: checkingId,
        date: "2026-01-02",
        amount: -100,
        kind: "expense",
        label: "Already there",
      });

      expect(previewSheetMigration(db, request([row()])).issues).toEqual([
        { kind: "ledgerNotEmpty", accountId: checkingId },
      ]);
      expect(() => commitSheetMigration(db, request([row()]))).toThrow(
        SheetMigrationBlockedError,
      );
    });

    it("reports an archived category with every line that uses it", () => {
      archiveCategory(db, createCategory(db, { name: "Food" }).id);

      const issues = previewSheetMigration(
        db,
        request([row({ line: 2 }), row({ line: 5, category: "food" })]),
      ).issues;

      expect(issues).toEqual([
        {
          kind: "categoryArchived",
          name: "Food",
          rows: [
            { source: "january.csv", line: 2 },
            { source: "january.csv", line: 5 },
          ],
        },
      ]);
    });

    it("reports a row that cannot be recorded, with its line", () => {
      const issues = previewSheetMigration(
        db,
        request([
          row({ line: 2, date: "2026-02-30" }),
          savingsRow({ line: 3, date: "2026-13-01" }),
          row({ line: 4, category: "   " }),
        ]),
      ).issues;

      expect(issues.map((issue) => [issue.kind, "line" in issue ? issue.line : null])).toEqual([
        ["rowInvalid", 2],
        ["rowInvalid", 3],
        ["rowInvalid", 4],
      ]);
    });

    it("tells apart the rows of different files that share a line number", () => {
      const issues = previewSheetMigration(
        db,
        request([
          row({ source: "february.csv", line: 2, date: "2026-02-31" }),
          row({ source: "january.csv", line: 2, date: "2026-01-32" }),
        ]),
      ).issues;

      expect(
        issues.map((issue) =>
          issue.kind === "rowInvalid" ? [issue.source, issue.line] : null,
        ),
      ).toEqual([
        ["february.csv", 2],
        ["january.csv", 2],
      ]);
    });

    it("reports an archived checking account", () => {
      archiveAccount(db, checkingId);

      expect(previewSheetMigration(db, request([row()])).issues).toContainEqual({
        kind: "accountArchived",
        accountId: checkingId,
      });
    });
  });

  describe("balance assertions from the Summary", () => {
    const summary = [
      summaryMonth("2026-01", { realAccountBalance: 7_500 }),
      summaryMonth("2026-02"),
      summaryMonth("2026-03", { realAccountBalance: 9_000 }),
    ];

    it("shows them in the preview and mentions the months that have no real balance", () => {
      const preview = previewSheetMigration(db, request([row()], { summary }));

      expect(preview.assertionsToCreate).toEqual([
        { accountId: checkingId, date: "2026-01-31", amount: 7_500 },
        { accountId: checkingId, date: "2026-03-31", amount: 9_000 },
      ]);
      expect(preview.notices).toContainEqual({
        kind: "assertionSkipped",
        month: "2026-02",
      });
      expect(preview.issues).toEqual([]);
    });

    it("records the real account balance of each month at its last day", () => {
      commitSheetMigration(db, request([row()], { summary }));

      expect(
        listBalanceAssertions(db, checkingId).map((a) => [a.date, a.amount]),
      ).toEqual([
        ["2026-03-31", 9_000],
        ["2026-01-31", 7_500],
      ]);
    });

    it("uses the real last day of the month, leap years included", () => {
      const preview = previewSheetMigration(
        db,
        request([row()], {
          summary: [
            summaryMonth("2028-02", { realAccountBalance: 1 }),
            summaryMonth("2026-04", { realAccountBalance: 2 }),
          ],
        }),
      );

      expect(preview.assertionsToCreate.map((a) => a.date)).toEqual([
        "2028-02-29",
        "2026-04-30",
      ]);
    });

    it("reports a balance that cannot be recorded, such as one before the opening", () => {
      const preview = previewSheetMigration(
        db,
        request([row()], {
          summary: [summaryMonth("2025-11", { realAccountBalance: 100 })],
        }),
      );

      expect(preview.issues).toEqual([
        expect.objectContaining({ kind: "assertionInvalid", month: "2025-11" }),
      ]);
    });
  });

  describe("categorization rules from the (label, category) pairs", () => {
    const shop = (line: number, label: string, category: string | null) =>
      row({ line, label, category });

    it("plans one equals rule per distinct pair, in order of appearance", () => {
      const rows = [
        shop(2, "Carrefour", "Food"),
        shop(3, "Landlord", "Rent"),
        shop(4, "CARREFOUR ", "food"),
        shop(5, "Gift", null),
        savingsRow({ line: 6, label: "Savings" }),
      ];

      expect(previewSheetMigration(db, request(rows)).rulesToCreate).toEqual([
        { value: "Carrefour", categoryName: "Food" },
        { value: "Landlord", categoryName: "Rent" },
      ]);
    });

    it("records them as global equals rules, in that order, on the categories of the rows", () => {
      commitSheetMigration(
        db,
        request([shop(2, "Carrefour", "Food"), shop(3, "Landlord", "Rent")]),
      );

      const categoryNames = new Map(
        listCategories(db).map((category) => [category.id, category.name]),
      );
      expect(
        listRules(db).map((rule) => [
          rule.operator,
          rule.value,
          rule.accountId,
          categoryNames.get(rule.categoryId),
          rule.priority,
        ]),
      ).toEqual([
        ["equals", "Carrefour", null, "Food", 1],
        ["equals", "Landlord", null, "Rent", 2],
      ]);
    });

    it("creates no rule for a label seen with two categories, and says so", () => {
      const preview = previewSheetMigration(
        db,
        request([
          shop(2, "Gift", "Food"),
          shop(3, "gift", "Presents"),
          shop(4, "Carrefour", "Food"),
        ]),
      );

      expect(preview.rulesToCreate).toEqual([
        { value: "Carrefour", categoryName: "Food" },
      ]);
      expect(preview.notices).toContainEqual({
        kind: "ruleConflict",
        label: "Gift",
        categories: ["Food", "Presents"],
      });
    });

    it("leaves an existing rule alone, and says so", () => {
      const food = createCategory(db, { name: "Food" });
      createRule(db, {
        operator: "equals",
        value: "carrefour",
        categoryId: food.id,
      });

      const preview = previewSheetMigration(
        db,
        request([shop(2, "Carrefour", "Food")]),
      );

      expect(preview.rulesToCreate).toEqual([]);
      expect(preview.notices).toContainEqual({
        kind: "ruleExists",
        label: "Carrefour",
      });
    });
  });

  describe("verification against the Summary", () => {
    // January: 1 500.00 in, 12.50 out, 573.16 saved (split over two accounts).
    const january = [
      row(),
      row({
        line: 3,
        date: "2026-01-10",
        label: "Salary",
        amount: 150_000,
        type: "income",
        category: "Pay",
      }),
      savingsRow({ line: 4 }),
    ];
    const matchingJanuary = summaryMonth("2026-01", {
      net: 148_750,
      savings: 57_316,
      cumulativeSavings: 57_316,
      cumulativeAccount: 91_434,
      savingsBalance: 205_000,
    });

    it("finds nothing to say when the Summary and the new history agree", () => {
      const preview = previewSheetMigration(
        db,
        request(january, { summary: [matchingJanuary] }),
      );

      expect(preview.verification).toEqual({
        differences: [],
        issues: [],
        isMatching: true,
      });
    });

    it("reports each figure that differs, month by month", () => {
      const preview = previewSheetMigration(
        db,
        request(january, {
          summary: [{ ...matchingJanuary, net: 148_700, savingsBalance: 205_100 }],
        }),
      );

      expect(preview.verification?.differences).toEqual([
        { month: "2026-01", figure: "net", sheet: 148_700, demain: 148_750 },
        {
          month: "2026-01",
          figure: "savingsBalance",
          sheet: 205_100,
          demain: 205_000,
        },
      ]);
    });

    it("reports a month of the new history that the Summary lacks", () => {
      const preview = previewSheetMigration(
        db,
        request([...january, row({ line: 5, date: "2026-02-03" })], {
          summary: [matchingJanuary],
        }),
      );

      expect(preview.verification?.issues).toEqual([
        { kind: "monthMissingInSheet", month: "2026-02" },
      ]);
    });

    it("says that nothing was verified when no Summary is given", () => {
      const preview = previewSheetMigration(db, request(january));

      expect(preview.verification).toBeNull();
      expect(preview.notices).toContainEqual({ kind: "summaryNotProvided" });
    });

    it("does not block the migration: the user decides on a difference", () => {
      expect(() =>
        commitSheetMigration(
          db,
          request(january, {
            summary: [{ ...matchingJanuary, net: 1 }],
          }),
        ),
      ).not.toThrow();
    });
  });

  describe("a write that fails half way", () => {
    it("leaves the ledger exactly as it was", () => {
      db.$client.exec(
        "create trigger fail_on_boom before insert on transactions when new.label = 'BOOM' begin select raise(abort, 'boom'); end;",
      );
      const failing = request(
        [
          row({ line: 2 }),
          savingsRow({ line: 3 }),
          row({ line: 4, label: "BOOM", category: "Other" }),
        ],
        { summary: [summaryMonth("2026-01", { realAccountBalance: 7_500 })] },
      );

      expect(() => commitSheetMigration(db, failing)).toThrow(/boom/);

      expect(listTransactions(db)).toEqual([]);
      expect(listCategories(db)).toEqual([]);
      expect(listRules(db)).toEqual([]);
      expect(listBalanceAssertions(db, checkingId)).toEqual([]);
      expect(getAccount(db, checkingId)).toMatchObject({
        openingBalance: 0,
        openingDate: "2026-01-01",
      });
    });
  });

  // The worked example of DOMAIN, with invented labels: the acceptance test of M1.
  describe("the worked example of the sheet", () => {
    const rows = [
      row({ line: 2, date: "2026-01-20", label: "Pay", amount: 57_614, type: "income", category: "Pay" }),
      savingsRow({ line: 3, date: "2026-01-31", amount: 57_316 }),
      row({ line: 4, date: "2026-02-20", label: "Pay", amount: 80_607, type: "income", category: "Pay" }),
      savingsRow({ line: 5, date: "2026-02-28", amount: 65_000 }),
    ];
    const summary = [
      summaryMonth("2026-01", {
        net: 57_614,
        savings: 57_316,
        cumulativeSavings: 57_316,
        cumulativeAccount: 298,
        savingsBalance: 205_000,
        realAccountBalance: 5_925,
      }),
      summaryMonth("2026-02", {
        net: 80_607,
        savings: 65_000,
        cumulativeSavings: 122_316,
        cumulativeAccount: 15_905,
        savingsBalance: 270_000,
        realAccountBalance: 21_532,
      }),
    ];
    const worked = (): SheetMigrationRequest =>
      request(rows, {
        summary,
        openingBalances: [
          { accountId: checkingId, amount: 5_627 },
          { accountId: livretJeuneId, amount: 147_684 },
          { accountId: livretAId, amount: 0 },
        ],
      });

    it("matches the Summary to the cent, month by month", () => {
      expect(previewSheetMigration(db, worked()).verification).toEqual({
        differences: [],
        issues: [],
        isMatching: true,
      });
    });

    it("leaves no unexplained gap on the real account balances once migrated", () => {
      commitSheetMigration(db, worked());

      expect(
        listBalanceAssertions(db, checkingId).map((a) => [a.date, a.amount, a.gap]),
      ).toEqual([
        ["2026-02-28", 21_532, 0],
        ["2026-01-31", 5_925, 0],
      ]);
      expect(getAccountBalance(db, checkingId)).toBe(21_532);
    });
  });
});
