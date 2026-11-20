import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { generateOccurrences } from "../../src/domain/occurrences";
import { PlannedItemValidationError, type PlannedItemInput } from "../../src/domain/planned-item";
import { createAccount } from "../../src/ledger/accounts";
import {
  createPlannedItem,
  getPlannedItem,
  listPlannedItems,
  PlannedItemNotFoundError,
  toPlannedSchedule,
  updatePlannedItemDetails,
} from "../../src/ledger/planned-items";
import { createTransaction } from "../../src/ledger/transactions";
import { type AppDatabase, migrateDatabase, openDatabase } from "../../src/storage/database";
import {
  occurrenceOverrides,
  plannedItems,
  plannedItemVersions,
  transactions,
} from "../../src/storage/schema";

const CHECKING_INPUT = {
  name: "Checking",
  kind: "checking",
  currency: "EUR",
  openingDate: "2026-01-01",
  openingBalance: 100_000,
};

const LAST_MIGRATION_BEFORE_PLANNED_ITEMS = "0012_category_icon";

/** A database as the release before planned items left it: migrations up to the given tag. */
function migrateUpTo(db: AppDatabase, workDir: string, lastTag: string): void {
  const source = path.join(process.cwd(), "drizzle");
  const target = path.join(workDir, "older-migrations");
  mkdirSync(path.join(target, "meta"), { recursive: true });
  const journal = JSON.parse(readFileSync(path.join(source, "meta", "_journal.json"), "utf8")) as {
    entries: { tag: string }[];
  };
  journal.entries = journal.entries.slice(
    0,
    journal.entries.findIndex(({ tag }) => tag === lastTag) + 1,
  );
  writeFileSync(path.join(target, "meta", "_journal.json"), JSON.stringify(journal));
  for (const { tag } of journal.entries) {
    cpSync(path.join(source, `${tag}.sql`), path.join(target, `${tag}.sql`));
  }
  migrate(drizzle(db.$client), { migrationsFolder: target });
}

describe("planned items", () => {
  let dataDir: string;
  let db: AppDatabase;
  let accountId: number;
  let rent: PlannedItemInput;

  beforeEach(() => {
    dataDir = mkdtempSync(path.join(tmpdir(), "demain-test-"));
    db = openDatabase(dataDir);
    migrateDatabase(db);
    accountId = createAccount(db, CHECKING_INPUT).id;
    rent = {
      name: "Rent",
      kind: "expense",
      accountId,
      startDate: "2026-01-05",
      repetition: { kind: "monthly_on_day", day: 5 },
      amount: -80_000,
    };
  });

  afterEach(() => {
    db.$client.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("creates an item and its first version in one transaction", () => {
    const item = createPlannedItem(db, rent);

    expect(item).toMatchObject({
      name: "Rent",
      kind: "expense",
      accountId,
      cancelled: false,
      matchWindowDays: 5,
      matchAmountToleranceBp: 500,
      overrides: [],
    });
    expect(item.versions).toEqual([
      expect.objectContaining({
        plannedItemId: item.id,
        effectiveFrom: "2026-01-05",
        repetitionKind: "monthly_on_day",
        repetitionValue: 5,
        businessDayRule: "none",
        amount: -80_000,
        amountMode: "fixed",
        averageWindow: 3,
      }),
    ]);
    expect(getPlannedItem(db, item.id)).toEqual(item);
  });

  it("writes nothing when the input is refused", () => {
    expect(() => createPlannedItem(db, { ...rent, amount: 0 })).toThrow(
      PlannedItemValidationError,
    );

    expect(db.select().from(plannedItems).all()).toEqual([]);
    expect(db.select().from(plannedItemVersions).all()).toEqual([]);
  });

  it("writes neither the item nor a version when the version insert fails", () => {
    db.$client.exec("drop table planned_item_versions");

    expect(() => createPlannedItem(db, rent)).toThrow();

    expect(db.select().from(plannedItems).all()).toEqual([]);
  });

  it("refuses a second version on the same effective date", () => {
    const item = createPlannedItem(db, rent);

    expect(() =>
      db
        .insert(plannedItemVersions)
        .values({ plannedItemId: item.id, effectiveFrom: "2026-01-05", amount: -90_000 })
        .run(),
    ).toThrow(/UNIQUE/);
  });

  it("refuses a second override on the same nominal date", () => {
    const item = createPlannedItem(db, rent);
    const override = { plannedItemId: item.id, nominalDate: "2026-02-05", status: "cancelled" } as const;
    db.insert(occurrenceOverrides).values(override).run();

    expect(() => db.insert(occurrenceOverrides).values(override).run()).toThrow(/UNIQUE/);
  });

  it("lists items without the cancelled ones unless asked", () => {
    const kept = createPlannedItem(db, rent);
    const cancelled = createPlannedItem(db, { ...rent, name: "Gym" });
    db.update(plannedItems).set({ cancelled: true }).where(eq(plannedItems.id, cancelled.id)).run();

    expect(listPlannedItems(db, { includeCancelled: false }).map((item) => item.id)).toEqual([
      kept.id,
    ]);
    expect(listPlannedItems(db, { includeCancelled: true }).map((item) => item.id)).toEqual([
      kept.id,
      cancelled.id,
    ]);
  });

  it("returns the versions sorted and the overrides of an item", () => {
    const item = createPlannedItem(db, rent);
    db.insert(plannedItemVersions)
      .values([
        { plannedItemId: item.id, effectiveFrom: "2026-06-05", amount: -90_000 },
        { plannedItemId: item.id, effectiveFrom: "2026-03-05", amount: -85_000 },
      ])
      .run();
    db.insert(occurrenceOverrides)
      .values({ plannedItemId: item.id, nominalDate: "2026-02-05", status: "cancelled" })
      .run();

    const stored = getPlannedItem(db, item.id);

    expect(stored.versions.map((version) => version.effectiveFrom)).toEqual([
      "2026-01-05",
      "2026-03-05",
      "2026-06-05",
    ]);
    expect(stored.overrides).toHaveLength(1);
  });

  it("throws for a missing item", () => {
    expect(() => getPlannedItem(db, 999)).toThrow(PlannedItemNotFoundError);
    expect(() => updatePlannedItemDetails(db, 999, details())).toThrow(PlannedItemNotFoundError);
  });

  it("maps a stored item to the schedule of the domain", () => {
    const item = createPlannedItem(db, rent);

    const occurrences = generateOccurrences(
      toPlannedSchedule(item),
      [],
      { from: "2026-01-01", to: "2026-03-31" },
      "2026-01-01",
    );

    expect(occurrences.map((occurrence) => [occurrence.date, occurrence.amount])).toEqual([
      ["2026-01-05", -80_000],
      ["2026-02-05", -80_000],
      ["2026-03-05", -80_000],
    ]);
  });

  it("updates the details of an item and nothing else", () => {
    const item = createPlannedItem(db, rent);

    const updated = updatePlannedItemDetails(db, item.id, {
      ...details(),
      name: "Flat rent",
      matchWindowDays: 7,
      matchAmountToleranceBp: 0,
    });

    expect(updated).toMatchObject({ name: "Flat rent", matchWindowDays: 7, matchAmountToleranceBp: 0 });
    expect(updated.versions).toEqual(item.versions);
    expect(updated.startDate).toBe(item.startDate);
  });

  it("refuses details that break the rules and keeps the item", () => {
    const item = createPlannedItem(db, rent);

    expect(() => updatePlannedItemDetails(db, item.id, { ...details(), name: " " })).toThrow(
      PlannedItemValidationError,
    );

    expect(getPlannedItem(db, item.id)).toEqual(item);
  });

  it("leaves existing transactions untouched", () => {
    const transaction = createTransaction(db, {
      accountId,
      date: "2026-01-10",
      amount: -1_000,
      kind: "expense",
      label: "Groceries",
    });

    const stored = db.select().from(transactions).where(eq(transactions.id, transaction.id)).get();

    expect(stored).toMatchObject({
      plannedItemId: null,
      occurrenceDate: null,
      categoryFromPlannedItem: false,
    });
  });

  it("applies on a database at 0012 and keeps its transactions unlinked", () => {
    const olderDir = mkdtempSync(path.join(tmpdir(), "demain-test-"));
    try {
      const older = openDatabase(olderDir);
      migrateUpTo(older, olderDir, LAST_MIGRATION_BEFORE_PLANNED_ITEMS);
      older.$client.exec(
        `insert into accounts (name, kind, currency, opening_date, opening_balance) values ('Checking', 'checking', 'EUR', '2026-01-01', 0);
         insert into transactions (account_id, date, amount, kind, label) values (1, '2026-01-10', -1000, 'expense', 'Groceries');`,
      );

      migrateDatabase(older);

      expect(older.select().from(transactions).all()).toEqual([
        expect.objectContaining({
          label: "Groceries",
          plannedItemId: null,
          occurrenceDate: null,
          categoryFromPlannedItem: false,
        }),
      ]);
      older.$client.close();
    } finally {
      rmSync(olderDir, { recursive: true, force: true });
    }
  });

  function details() {
    return {
      name: "Rent",
      categoryId: null,
      matchWindowDays: 5,
      matchAmountToleranceBp: 500,
      provisionLabelFilter: null,
    };
  }
});
