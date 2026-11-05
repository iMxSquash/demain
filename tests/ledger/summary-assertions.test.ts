import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { BalanceAssertionValidationError } from "../../src/domain/balance-assertion";
import { archiveAccount, createAccount } from "../../src/ledger/accounts";
import {
  BalanceAssertionOnArchivedAccountError,
  listBalanceAssertions,
  saveBalanceAssertion,
} from "../../src/ledger/balance-assertions";
import {
  previewSummaryAssertions,
  saveSummaryAssertions,
} from "../../src/ledger/summary-assertions";
import {
  type AppDatabase,
  migrateDatabase,
  openDatabase,
} from "../../src/storage/database";

const TODAY = "2026-05-10";

const CHECKING_INPUT = {
  name: "Checking",
  kind: "checking",
  currency: "EUR",
  openingDate: "2026-01-15",
  openingBalance: 0,
};

const BALANCES = [
  { month: "2025-12", amount: 9 },
  { month: "2026-01", amount: 1_000 },
  { month: "2026-02", amount: null },
  { month: "2026-03", amount: -250 },
  { month: "2026-05", amount: 4 },
];

describe("summary assertions", () => {
  let dataDir: string;
  let db: AppDatabase;

  beforeEach(() => {
    dataDir = mkdtempSync(path.join(tmpdir(), "demain-test-"));
    db = openDatabase(dataDir);
    migrateDatabase(db);
  });

  afterEach(() => {
    db.$client.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  const dates = (accountId: number) =>
    listBalanceAssertions(db, accountId)
      .map((a) => [a.date, a.amount])
      .reverse();

  it("previews what would be created, replaced and refused, writing nothing", () => {
    const account = createAccount(db, CHECKING_INPUT);
    saveBalanceAssertion(db, {
      accountId: account.id,
      date: "2026-03-31",
      amount: 100,
    });

    const preview = previewSummaryAssertions(db, account.id, BALANCES, TODAY);

    expect(preview.assertions).toEqual([
      { accountId: account.id, date: "2026-01-31", amount: 1_000, replacedAmount: null },
      { accountId: account.id, date: "2026-03-31", amount: -250, replacedAmount: 100 },
    ]);
    expect(preview.withoutBalance).toEqual(["2026-02"]);
    expect(preview.refused).toEqual([
      { month: "2025-12", reason: "beforeOpening" },
      { month: "2026-05", reason: "afterToday" },
    ]);
    expect(dates(account.id)).toEqual([["2026-03-31", 100]]);
  });

  it("refuses every month of an archived account in the preview", () => {
    const account = createAccount(db, CHECKING_INPUT);
    archiveAccount(db, account.id);

    const preview = previewSummaryAssertions(db, account.id, BALANCES, TODAY);

    expect(preview.assertions).toEqual([]);
    expect(preview.refused.map((r) => r.reason)).toEqual([
      "accountArchived",
      "accountArchived",
      "accountArchived",
      "accountArchived",
    ]);
  });

  it("records the accepted months and replaces the day that already has one", () => {
    const account = createAccount(db, CHECKING_INPUT);
    saveBalanceAssertion(db, {
      accountId: account.id,
      date: "2026-03-31",
      amount: 100,
    });

    const result = saveSummaryAssertions(db, account.id, BALANCES, TODAY);

    expect(result.saved.map((a) => [a.date, a.replaced])).toEqual([
      ["2026-01-31", false],
      ["2026-03-31", true],
    ]);
    expect(result.withoutBalance).toEqual(["2026-02"]);
    expect(result.refused).toHaveLength(2);
    expect(dates(account.id)).toEqual([
      ["2026-01-31", 1_000],
      ["2026-03-31", -250],
    ]);
  });

  it("records nothing when one item fails", () => {
    const account = createAccount(db, CHECKING_INPUT);
    saveBalanceAssertion(db, {
      accountId: account.id,
      date: "2026-03-31",
      amount: 100,
    });
    const broken = [
      { month: "2026-01", amount: 1_000 },
      { month: "2026-03", amount: 1.5 },
    ];

    expect(() => saveSummaryAssertions(db, account.id, broken, TODAY)).toThrow(
      BalanceAssertionValidationError,
    );
    expect(dates(account.id)).toEqual([["2026-03-31", 100]]);
  });

  it("throws on an archived account and records nothing", () => {
    const account = createAccount(db, CHECKING_INPUT);
    archiveAccount(db, account.id);

    expect(() => saveSummaryAssertions(db, account.id, BALANCES, TODAY)).toThrow(
      BalanceAssertionOnArchivedAccountError,
    );
    expect(dates(account.id)).toEqual([]);
  });
});
