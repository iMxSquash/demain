import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { PlannedItemInput } from "../../src/domain/planned-item";
import { createAccount } from "../../src/ledger/accounts";
import { createCategory } from "../../src/ledger/categories";
import { saveExchangeRate } from "../../src/ledger/exchange-rates";
import { cancelPlannedItem, createPlannedItem } from "../../src/ledger/planned-items";
import { linkTransactionToOccurrence } from "../../src/ledger/planned-matching";
import { getPlannedTrajectory } from "../../src/ledger/projection";
import { createTransaction } from "../../src/ledger/transactions";
import { type AppDatabase, migrateDatabase, openDatabase } from "../../src/storage/database";

const TODAY = "2026-03-12";
const MONTHS = 3;
const OPTIONS = { referenceCurrency: "EUR", today: TODAY, months: MONTHS };
const SALARY = 200_000;

const ACCOUNT_DETAILS = { currency: "EUR", openingDate: "2026-01-01" } as const;

describe("planned trajectory of the month-end totals", () => {
  let dataDir: string;
  let db: AppDatabase;
  let checkingId: number;
  let savingsId: number;

  beforeEach(() => {
    dataDir = mkdtempSync(path.join(tmpdir(), "demain-test-"));
    db = openDatabase(dataDir);
    migrateDatabase(db);
    checkingId = createAccount(db, {
      ...ACCOUNT_DETAILS,
      name: "Checking",
      kind: "checking",
      openingBalance: 100_000,
    }).id;
    savingsId = createAccount(db, {
      ...ACCOUNT_DETAILS,
      name: "Savings",
      kind: "savings",
      openingBalance: 50_000,
    }).id;
  });

  afterEach(() => {
    db.$client.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  function planSalary(overrides: Partial<PlannedItemInput> = {}) {
    return createPlannedItem(db, {
      name: "Salary",
      kind: "income",
      accountId: checkingId,
      startDate: "2026-03-01",
      repetition: { kind: "monthly_on_day", day: 20 },
      amount: SALARY,
      ...overrides,
    });
  }

  const trajectory = (options = OPTIONS) => getPlannedTrajectory(db, options);

  it("without planned items, there is no planned month", () => {
    createTransaction(db, {
      accountId: checkingId,
      date: "2026-02-10",
      amount: -5_000,
      kind: "expense",
      label: "SHOP",
    });

    expect(trajectory()).toEqual([]);
  });

  it("a future salary raises the checking month-ends after today", () => {
    planSalary();

    expect(trajectory()).toEqual([
      { month: "2026-03", checking: 300_000, savings: 50_000, unconvertedCurrencies: [] },
      { month: "2026-04", checking: 500_000, savings: 50_000, unconvertedCurrencies: [] },
      { month: "2026-05", checking: 700_000, savings: 50_000, unconvertedCurrencies: [] },
    ]);
  });

  it("starts at the current month and covers the requested number of months", () => {
    planSalary();

    expect(trajectory({ ...OPTIONS, months: 1 }).map(({ month }) => month)).toEqual(["2026-03"]);
    expect(trajectory({ ...OPTIONS, months: 12 }).map(({ month }) => month)).toHaveLength(12);
    expect(trajectory({ ...OPTIONS, months: 12 }).at(-1)?.month).toBe("2027-02");
  });

  it("a planned transfer moves money from checking to savings in the month-ends", () => {
    createPlannedItem(db, {
      name: "Monthly saving",
      kind: "transfer",
      accountId: checkingId,
      destinationAccountId: savingsId,
      startDate: "2026-03-01",
      repetition: { kind: "monthly_on_day", day: 25 },
      amount: -30_000,
    });

    expect(trajectory()).toEqual([
      { month: "2026-03", checking: 70_000, savings: 80_000, unconvertedCurrencies: [] },
      { month: "2026-04", checking: 40_000, savings: 110_000, unconvertedCurrencies: [] },
      { month: "2026-05", checking: 10_000, savings: 140_000, unconvertedCurrencies: [] },
    ]);
  });

  describe("accounts in another currency", () => {
    it("is converted with the latest rate on or before each month-end date", () => {
      const usdId = createAccount(db, {
        ...ACCOUNT_DETAILS,
        name: "Dollars",
        kind: "checking",
        currency: "USD",
        openingBalance: 10_000,
      }).id;
      createPlannedItem(db, {
        name: "Dollar income",
        kind: "income",
        accountId: usdId,
        startDate: "2026-03-01",
        repetition: { kind: "monthly_on_day", day: 20 },
        amount: 10_000,
      });
      saveExchangeRate(db, { date: "2026-01-01", base: "USD", quote: "EUR", rate: "0.5" });
      saveExchangeRate(db, { date: "2026-04-15", base: "USD", quote: "EUR", rate: "0.8" });

      const months = trajectory();

      // USD month-ends are 20 000, 30 000 and 40 000, on top of the 100 000 EUR.
      expect(months.map(({ month, checking }) => [month, checking])).toEqual([
        ["2026-03", 100_000 + 10_000],
        ["2026-04", 100_000 + 24_000],
        ["2026-05", 100_000 + 32_000],
      ]);
    });

    it("reports a currency without any rate and leaves it out of the totals", () => {
      const chfId = createAccount(db, {
        ...ACCOUNT_DETAILS,
        name: "Swiss",
        kind: "checking",
        currency: "CHF",
        openingBalance: 7_000,
      }).id;
      createPlannedItem(db, {
        name: "Swiss income",
        kind: "income",
        accountId: chfId,
        startDate: "2026-03-01",
        repetition: { kind: "monthly_on_day", day: 20 },
        amount: 1_000,
      });
      planSalary();

      const months = trajectory();

      expect(months.map(({ unconvertedCurrencies }) => unconvertedCurrencies)).toEqual([
        ["CHF"],
        ["CHF"],
        ["CHF"],
      ]);
      expect(months.map(({ checking }) => checking)).toEqual([300_000, 500_000, 700_000]);
    });
  });

  it("a category with past spending and no planned item changes nothing", () => {
    const groceries = createCategory(db, { name: "Groceries" });
    for (const date of ["2026-01-10", "2026-02-10", "2026-03-05"]) {
      createTransaction(db, {
        accountId: checkingId,
        date,
        amount: -8_000,
        kind: "expense",
        label: "SUPERMARKET",
        categoryId: groceries.id,
      });
    }

    expect(trajectory()).toEqual([]);
  });

  it("counts the current month as the real transactions so far plus what is still planned", () => {
    createTransaction(db, {
      accountId: checkingId,
      date: "2026-03-05",
      amount: -20_000,
      kind: "expense",
      label: "SHOP",
    });
    planSalary();

    const [current] = trajectory();

    expect(current).toMatchObject({ month: "2026-03", checking: 100_000 - 20_000 + SALARY });
  });

  it("does not count a salary twice once a real transaction settles it", () => {
    const salary = planSalary({ repetition: { kind: "monthly_on_day", day: 10 } });
    const received = createTransaction(db, {
      accountId: checkingId,
      date: "2026-03-10",
      amount: SALARY,
      kind: "income",
      label: "SALARY",
    });
    db.transaction((tx) =>
      linkTransactionToOccurrence(tx, {
        transactionId: received.id,
        plannedItemId: salary.id,
        nominalDate: "2026-03-10",
      }),
    );

    expect(trajectory().map(({ month, checking }) => [month, checking])).toEqual([
      ["2026-03", 300_000],
      ["2026-04", 500_000],
      ["2026-05", 700_000],
    ]);
  });

  it("ignores a cancelled planned item", () => {
    const salary = planSalary();
    cancelPlannedItem(db, salary.id);

    expect(trajectory()).toEqual([]);
  });
});
